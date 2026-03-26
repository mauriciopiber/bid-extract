/**
 * Extraction pipeline — page by page with context passing.
 *
 * Page 1 establishes bidder names. Pages 2+ receive those names as context
 * so they map data to the SAME bidders. Merge is trivial — same name = same bidder.
 */

import { basename } from "node:path";
import { classifyPage } from "./agents/classifier.js";
import type { PageClassification } from "./agents/classifier.js";
import {
	extractPage,
	extractBidderNames,
	type PageContext,
	type PageExtractionResult,
} from "./agents/page-extractor.js";
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
import type { BidTabulation, Bidder, LineItem } from "./schemas/bid-tabulation.js";
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
	_maxCorrections = 2,
): Promise<PipelineResult> {
	const startTime = Date.now();
	const logger = new PipelineLogger();
	const pdfFile = basename(pdfPath);

	const extraction = await createExtraction({ pdfFile });
	logger.setExtractionId(extraction.id);

	// Step 1: Render pages
	const pages = await pdfToImages(pdfPath);
	await logger.log("render", `${pages.length} page(s)`);

	// Step 2: Classify all pages first
	const classifications: PageClassification[] = [];
	for (const page of pages) {
		const c = await classifyPage(page.image, page.pageNumber);
		classifications.push(c);
		await logger.log(
			"classify",
			`p${page.pageNumber}: ${c.pageType} (${Math.round(c.confidence * 100)}%)`,
			c,
		);
	}

	// Step 3: Extract page by page WITH context
	const context: PageContext = {
		bidderNames: [],
		hasEngineerEstimate: classifications.some((c) => c.hasEngineerEstimate),
		sections: [],
		isContinuation: false,
	};

	const pageResults: PageExtractionResult[] = [];

	for (let i = 0; i < pages.length; i++) {
		const page = pages[i];
		const classification = classifications[i];

		if (classification.pageType === "other") {
			await logger.log("extract", `p${page.pageNumber}: skipped (other)`);
			continue;
		}

		// Is this a continuation of a table from a previous page?
		if (i > 0 && classification.pageType === "bid_tabulation") {
			const prevType = classifications[i - 1]?.pageType;
			context.isContinuation = prevType === "bid_tabulation";
		}

		try {
			const result = await extractPage(page.image, classification, context);
			pageResults.push(result);

			// Update context with what this page found
			const newBidders = extractBidderNames(result);
			if (newBidders.length > 0 && context.bidderNames.length === 0) {
				context.bidderNames = newBidders;
				await logger.log(
					"context",
					`p${page.pageNumber}: established ${newBidders.length} bidders: ${newBidders.join(", ")}`,
				);
			}

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
			);
		} catch (err) {
			await logger.error(
				"extract",
				`p${page.pageNumber}: failed — ${err instanceof Error ? err.message : err}`,
			);
		}
	}

	// Step 4: Merge page results
	const data = mergePageResults(pageResults, pdfFile);

	// Step 5: Math resolver
	const mathResult = resolveMath(data);
	if (mathResult.corrected > 0) {
		await logger.log("math-resolve", `fixed ${mathResult.corrected} values`);
	}

	// Step 6: Validate
	const validation = validateBidTabulation(data);
	if (validation.errors.length > 0 || validation.warnings.length > 0) {
		await logger.log(
			"validate",
			`${validation.errors.length} errors, ${validation.warnings.length} warnings`,
		);
	}

	data.extraction.warnings = validation.warnings;
	data.extraction.processingTimeMs = Date.now() - startTime;

	// Step 7: Layout + scoring
	const docClass = buildDocClassification(classifications);
	const fingerprint = `${docClass.formatType}:${docClass.bidderCount}b:${docClass.hasLineItems ? "li" : "no-li"}:${pages.length}p`;
	const layout = await findOrCreateLayout(
		fingerprint,
		`${docClass.formatType} (${docClass.bidderCount} bidders, ${pages.length}p)`,
		docClass.formatType,
		{ pageTypes: classifications.map((c) => c.pageType), ...docClass },
	);

	const totalLineItems = data.bidders.reduce(
		(sum, b) => sum + (b.lineItems?.length ?? 0),
		0,
	);

	const mathScore = computeMathScore(data);
	const completenessScore = computeCompletenessScore(data, docClass);
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

/** Merge per-page results into BidTabulation using bidder name as identity key */
function mergePageResults(
	pageResults: PageExtractionResult[],
	sourceFile: string,
): BidTabulation {
	const projectInfo: Record<string, string> = {};
	const bidderMap = new Map<string, Bidder>();
	let engineerEstimate: { total: number; lineItems: LineItem[] } | undefined;

	for (const page of pageResults) {
		const d = page.data;

		// Project info from any page
		if (d.project && typeof d.project === "object") {
			Object.assign(projectInfo, d.project);
		}

		// Bid ranking pages → bidder totals
		if (page.pageType === "bid_ranking" && Array.isArray(d.bidders)) {
			for (const b of d.bidders as { rank?: number; name: string; totalBaseBid?: number; address?: string }[]) {
				const existing = bidderMap.get(b.name);
				if (existing) {
					if (b.totalBaseBid) existing.totalBaseBid = b.totalBaseBid;
					if (b.address) existing.address = b.address;
				} else {
					bidderMap.set(b.name, {
						rank: b.rank ?? bidderMap.size + 1,
						name: b.name,
						totalBaseBid: b.totalBaseBid,
						address: b.address,
						lineItems: [],
					});
				}
			}
		}

		// Bid tabulation pages → line items per bidder
		if (page.pageType === "bid_tabulation" && Array.isArray(d.sections)) {
			for (const section of d.sections as { name?: string; items?: Record<string, unknown>[] }[]) {
				for (const item of section.items ?? []) {
					const bids = item.bids as Record<string, { unitPrice?: number; extendedPrice?: number }> | undefined;
					if (!bids) continue;

					for (const [bidderName, bid] of Object.entries(bids)) {
						if (!bidderMap.has(bidderName)) {
							bidderMap.set(bidderName, {
								rank: bidderMap.size + 1,
								name: bidderName,
								lineItems: [],
							});
						}
						const bidder = bidderMap.get(bidderName)!;
						if (!bidder.lineItems) bidder.lineItems = [];

						bidder.lineItems.push({
							itemNo: item.itemNo as string | number,
							description: item.description as string,
							section: section.name,
							unit: item.unit as string | undefined,
							quantity: item.quantity as number | undefined,
							unitPrice: bid.unitPrice,
							extendedPrice: bid.extendedPrice,
						});
					}

					// Engineer estimate
					const engEst = item.engineerEstimate as { unitPrice?: number; extendedPrice?: number } | undefined;
					if (engEst) {
						if (!engineerEstimate) engineerEstimate = { total: 0, lineItems: [] };
						engineerEstimate.lineItems.push({
							itemNo: item.itemNo as string | number,
							description: item.description as string,
							section: section.name,
							unit: item.unit as string | undefined,
							quantity: item.quantity as number | undefined,
							unitPrice: engEst.unitPrice,
							extendedPrice: engEst.extendedPrice,
						});
						if (engEst.extendedPrice) engineerEstimate.total += engEst.extendedPrice;
					}
				}
			}
		}
	}

	// Sort bidders by rank
	const bidders = Array.from(bidderMap.values()).sort(
		(a, b) => a.rank - b.rank,
	);

	// Compute totals from line items if not set from ranking
	for (const bidder of bidders) {
		if (!bidder.totalBaseBid && bidder.lineItems && bidder.lineItems.length > 0) {
			bidder.totalBaseBid = bidder.lineItems.reduce(
				(sum, li) => sum + (li.extendedPrice ?? 0),
				0,
			);
		}
	}

	return {
		sourceFile,
		project: projectInfo.name ? projectInfo as unknown as BidTabulation["project"] : { name: sourceFile.replace(".pdf", "") },
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

function buildDocClassification(pages: PageClassification[]) {
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
