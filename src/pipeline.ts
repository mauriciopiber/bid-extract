/**
 * Extraction pipeline — page by page.
 *
 * For each page:
 *   render → classify → extract (based on page type) → store
 *
 * Then merge page results into document-level result.
 */

import { basename } from "node:path";
import { classifyPage } from "./agents/classifier.js";
import type { PageClassification, DocumentClassification } from "./agents/classifier.js";
import { extractPage } from "./agents/page-extractor.js";
import { resolveMath } from "./agents/math-resolver.js";
import { validateBidTabulation } from "./agents/validator.js";
import {
	createExtraction,
	updateExtraction,
	findOrCreateLayout,
	createEval,
} from "./db/operations.js";
import { db, schema } from "./db/index.js";
import { PipelineLogger } from "./db/logger.js";
import type { BidTabulation } from "./schemas/bid-tabulation.js";
import { pdfToImages } from "./utils/pdf-to-images.js";

export interface PipelineResult {
	data: BidTabulation;
	extractionId: number;
	corrections: number;
	mathCorrections: number;
	finalValid: boolean;
}

export async function runPipeline(
	pdfPath: string,
	maxCorrections = 2,
): Promise<PipelineResult> {
	const startTime = Date.now();
	const logger = new PipelineLogger();
	const pdfFile = basename(pdfPath);

	const extraction = await createExtraction({ pdfFile });
	logger.setExtractionId(extraction.id);

	// Step 1: Render pages
	const pages = await pdfToImages(pdfPath);
	await logger.log("render", `${pages.length} page(s)`, {
		pageCount: pages.length,
	});

	// Step 2: Classify + extract each page
	const pageClassifications: PageClassification[] = [];
	const pageResults: { pageNumber: number; pageType: string; data: Record<string, unknown> }[] = [];

	for (const page of pages) {
		// Classify
		const classification = await classifyPage(page.image, page.pageNumber);
		pageClassifications.push(classification);

		await logger.log(
			"classify",
			`p${page.pageNumber}: ${classification.pageType} (${Math.round(classification.confidence * 100)}%)`,
			classification,
		);

		// Extract (skip "other" pages)
		if (classification.pageType === "other") {
			await logger.log("extract", `p${page.pageNumber}: skipped (other)`);
			continue;
		}

		try {
			const result = await extractPage(page.image, classification);
			pageResults.push(result);

			// Store per-page result
			await db.insert(schema.pageExtractions).values({
				extractionId: extraction.id,
				pageNumber: page.pageNumber,
				pageType: classification.pageType,
				confidence: classification.confidence,
				resultJson: result.data,
				notes: classification.notes,
			});

			await logger.log(
				"extract",
				`p${page.pageNumber}: ${classification.pageType} extracted`,
				{ keys: Object.keys(result.data) },
			);
		} catch (err) {
			await logger.error(
				"extract",
				`p${page.pageNumber}: failed — ${err instanceof Error ? err.message : err}`,
			);
		}
	}

	// Step 3: Merge page results into document-level BidTabulation
	const data = mergePageResults(pageResults, pdfFile);

	// Step 4: Math resolver
	const mathResult = resolveMath(data);
	if (mathResult.corrected > 0) {
		await logger.log("math-resolve", `fixed ${mathResult.corrected} values`, {
			corrections: mathResult.corrections,
		});
	}

	// Step 5: Validate
	const validation = validateBidTabulation(data);
	if (validation.errors.length > 0 || validation.warnings.length > 0) {
		await logger.log(
			"validate",
			`${validation.errors.length} errors, ${validation.warnings.length} warnings`,
			{ errors: validation.errors, warnings: validation.warnings },
		);
	}

	data.extraction.warnings = validation.warnings;
	data.extraction.processingTimeMs = Date.now() - startTime;

	// Step 6: Build document classification from pages
	const docClassification = buildDocClassification(pageClassifications);

	// Step 7: Find/create layout
	const fingerprint = `${docClassification.formatType}:${docClassification.bidderCount}b:${docClassification.hasLineItems ? "li" : "no-li"}:${pages.length}p`;
	const layout = await findOrCreateLayout(
		fingerprint,
		`${docClassification.formatType} (${docClassification.bidderCount} bidders, ${pages.length}p)`,
		docClassification.formatType,
		{
			pageTypes: pageClassifications.map((p) => p.pageType),
			bidderCount: docClassification.bidderCount,
			hasLineItems: docClassification.hasLineItems,
			pageCount: pages.length,
		},
	);

	// Step 8: Score
	const totalLineItems = data.bidders.reduce(
		(sum, b) => sum + (b.lineItems?.length ?? 0),
		0,
	);

	const mathScore = computeMathScore(data);
	const completenessScore = computeCompletenessScore(data, docClassification);
	const overall = Math.round((mathScore + completenessScore) / 2);

	await updateExtraction(extraction.id, {
		layoutId: layout.id,
		resultJson: data as unknown as Record<string, unknown>,
		bidderCount: data.bidders.length,
		lineItemCount: totalLineItems,
		warningCount: validation.warnings.length,
		errorCount: validation.errors.length,
		mathCorrections: mathResult.corrected,
		processingTimeMs: Date.now() - startTime,
	});

	await createEval({
		extractionId: extraction.id,
		layoutId: layout.id,
		mathScore,
		completenessScore,
		overallScore: overall,
	});

	await logger.log("done", `score=${overall} (math=${mathScore}, completeness=${completenessScore})`);

	return {
		data,
		extractionId: extraction.id,
		corrections: 0,
		mathCorrections: mathResult.corrected,
		finalValid: validation.errors.length === 0,
	};
}

/** Merge per-page extraction results into a single BidTabulation */
function mergePageResults(
	pageResults: { pageNumber: number; pageType: string; data: Record<string, unknown> }[],
	sourceFile: string,
): BidTabulation {
	// biome-ignore lint: dynamic page data
	const project: any = {};
	// biome-ignore lint: dynamic page data
	const bidders: any[] = [];
	// biome-ignore lint: dynamic page data
	let engineerEstimate: any = undefined;

	for (const page of pageResults) {
		const d = page.data;

		// Merge project info from any page that has it
		if (d.project) {
			Object.assign(project, d.project);
		}

		// Merge bidders from ranking pages
		if (page.pageType === "bid_ranking" && Array.isArray(d.bidders)) {
			for (const b of d.bidders) {
				const existing = bidders.find(
					// biome-ignore lint: dynamic
					(eb: any) => eb.name === b.name,
				);
				if (existing) {
					Object.assign(existing, b);
				} else {
					bidders.push({ ...b });
				}
			}
		}

		// Merge line items from tabulation pages
		if (page.pageType === "bid_tabulation" && Array.isArray(d.sections)) {
			for (const section of d.sections as { name?: string; items?: unknown[] }[]) {
				if (!Array.isArray(section.items)) continue;
				for (const item of section.items as Record<string, unknown>[]) {
					const bids = item.bids as { bidder: string; unitPrice?: number; extendedPrice?: number }[] | undefined;
					if (!bids) continue;

					for (const bid of bids) {
						let bidder = bidders.find(
							// biome-ignore lint: dynamic
							(b: any) => b.name === bid.bidder,
						);
						if (!bidder) {
							bidder = { rank: bidders.length + 1, name: bid.bidder, lineItems: [] };
							bidders.push(bidder);
						}
						if (!bidder.lineItems) bidder.lineItems = [];
						bidder.lineItems.push({
							itemNo: item.itemNo,
							description: item.description,
							section: section.name || item.section,
							unit: item.unit,
							quantity: item.quantity,
							unitPrice: bid.unitPrice,
							extendedPrice: bid.extendedPrice,
						});
					}

					// Engineer estimate
					const engEst = item.engineerEstimate as { unitPrice?: number; extendedPrice?: number } | undefined;
					if (engEst) {
						if (!engineerEstimate) engineerEstimate = { total: 0, lineItems: [] };
						engineerEstimate.lineItems.push({
							itemNo: item.itemNo,
							description: item.description,
							section: section.name || item.section,
							unit: item.unit,
							quantity: item.quantity,
							unitPrice: engEst.unitPrice,
							extendedPrice: engEst.extendedPrice,
						});
						if (engEst.extendedPrice) {
							engineerEstimate.total += engEst.extendedPrice;
						}
					}
				}
			}
		}

		// Cover page
		if (page.pageType === "cover" && d.project) {
			Object.assign(project, d.project);
		}

		// Summary page
		if (page.pageType === "summary") {
			if (d.engineerEstimate && !engineerEstimate) {
				engineerEstimate = { total: d.engineerEstimate };
			}
		}
	}

	// Sort bidders by rank
	bidders.sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999));

	return {
		sourceFile,
		project: project.name ? project : { name: sourceFile.replace(".pdf", "") },
		bidders,
		engineerEstimate,
		extraction: {
			formatType: "unknown",
			confidence: 0,
			pagesProcessed: pageResults.length,
			warnings: [],
			processingTimeMs: 0,
		},
	};
}

function buildDocClassification(
	pages: PageClassification[],
): { formatType: string; bidderCount: number; hasLineItems: boolean } {
	const tabPages = pages.filter((p) => p.pageType === "bid_tabulation");
	const rankPages = pages.filter((p) => p.pageType === "bid_ranking");
	const hasLineItems = tabPages.length > 0;

	let formatType = "unknown";
	if (tabPages.length > 0) {
		const maxBidders = Math.max(...tabPages.map((p) => p.bidderCount));
		if (tabPages.some((p) => p.hasHandwriting)) formatType = "handwritten";
		else if (maxBidders >= 4) formatType = "multi-bidder-matrix";
		else if (tabPages.some((p) => p.hasUnitPrices)) formatType = "engineering-firm";
		else formatType = "simple-table";
	} else if (rankPages.length > 0) {
		formatType = "summary-only";
	}

	const allBidders = pages.map((p) => p.bidderCount).filter((c) => c > 0);
	return {
		formatType,
		bidderCount: allBidders.length > 0 ? Math.max(...allBidders) : 0,
		hasLineItems,
	};
}

function computeMathScore(data: BidTabulation): number {
	let total = 0;
	let correct = 0;
	for (const bidder of data.bidders) {
		for (const item of bidder.lineItems ?? []) {
			if (item.unitPrice != null && item.quantity != null && item.extendedPrice != null) {
				total++;
				const expected = Math.round(item.unitPrice * item.quantity * 100) / 100;
				if (Math.abs(expected - item.extendedPrice) <= 0.01) correct++;
			}
		}
	}
	return total === 0 ? 100 : Math.round((correct / total) * 100);
}

function computeCompletenessScore(
	data: BidTabulation,
	classification: { bidderCount: number; hasLineItems: boolean },
): number {
	let score = 100;
	if (data.bidders.length < classification.bidderCount) {
		score = Math.round(score * (data.bidders.length / classification.bidderCount));
	}
	if (classification.hasLineItems) {
		const withItems = data.bidders.filter((b) => b.lineItems && b.lineItems.length > 0).length;
		if (withItems === 0) score = Math.round(score * 0.2);
		else if (withItems < data.bidders.length) score = Math.round(score * (withItems / data.bidders.length));
	}
	return score;
}
