/**
 * Extraction pipeline — page by page with context passing.
 *
 * Page 1 establishes bidder names. Pages 2+ receive those names as context.
 * Math mismatches are REPORTED, not fixed. Only human contests change values.
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
import { validateBidTabulation } from "./agents/validator.js";
import {
	createExtraction,
	updateExtraction,
	findOrCreateLayout,
	createEval,
} from "./db/operations.js";
import { db, schema } from "./db/index.js";
import { PipelineLogger } from "./db/logger.js";
import type {
	BidTabulation,
	BidderInfo,
	Contract,
	BidGroup,
	Section,
	Item,
} from "./schemas/bid-tabulation.js";
import { toLegacyBidders, toLegacyEstimate } from "./schemas/bid-tabulation.js";
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

	// Step 2: Classify all pages
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

		if (i > 0 && classification.pageType === "bid_tabulation") {
			context.isContinuation =
				classifications[i - 1]?.pageType === "bid_tabulation";
		}

		try {
			const result = await extractPage(page.image, classification, context);
			pageResults.push(result);

			// Update context from first bid page
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

	// Step 4: Merge into hierarchical schema
	const data = mergePageResults(pageResults, pdfFile);

	// Step 5: Validate using legacy flat format (reports only, no fixes)
	const legacyBidders = toLegacyBidders(data);
	const legacyEstimate = toLegacyEstimate(data);
	const validation = validateBidTabulation({
		sourceFile: pdfFile,
		project: data.project,
		bidders: legacyBidders,
		engineerEstimate: legacyEstimate,
		extraction: data.extraction,
	});

	if (validation.errors.length > 0 || validation.warnings.length > 0) {
		await logger.log(
			"validate",
			`${validation.errors.length} errors, ${validation.warnings.length} warnings`,
		);
	}

	data.extraction.warnings = validation.warnings;
	data.extraction.processingTimeMs = Date.now() - startTime;

	// Step 6: Layout + scoring
	const docClass = buildDocClassification(classifications);
	const fingerprint = `${docClass.formatType}:${docClass.bidderCount}b:${docClass.hasLineItems ? "li" : "no-li"}:${pages.length}p`;
	const layout = await findOrCreateLayout(
		fingerprint,
		`${docClass.formatType} (${docClass.bidderCount} bidders, ${pages.length}p)`,
		docClass.formatType,
		{ pageTypes: classifications.map((c) => c.pageType), ...docClass },
	);

	const totalLineItems = legacyBidders.reduce(
		(sum, b) => sum + (b.lineItems?.length ?? 0),
		0,
	);

	const mathScore = computeMathScore(legacyBidders);
	const completenessScore = computeCompletenessScore(
		data,
		legacyBidders,
		docClass,
	);
	const overall = Math.round((mathScore + completenessScore) / 2);

	await updateExtraction(extraction.id, {
		layoutId: layout.id,
		resultJson: data as unknown as Record<string, unknown>,
		bidderCount: data.bidders.length,
		lineItemCount: totalLineItems,
		warningCount: validation.warnings.length,
		errorCount: validation.errors.length,
		mathCorrections: 0,
		processingTimeMs: Date.now() - startTime,
	});

	await createEval({
		extractionId: extraction.id,
		layoutId: layout.id,
		mathScore,
		completenessScore,
		overallScore: overall,
	});

	await logger.log(
		"done",
		`score=${overall} (math=${mathScore}, completeness=${completenessScore})`,
	);

	return {
		data,
		extractionId: extraction.id,
		corrections: 0,
		mathCorrections: 0,
		finalValid: validation.errors.length === 0,
	};
}

// -- Merge --

function mergePageResults(
	pageResults: PageExtractionResult[],
	sourceFile: string,
): BidTabulation {
	const projectInfo: Record<string, string> = {};
	const bidderMap = new Map<string, BidderInfo>();
	let engTotal: number | undefined;
	const bidGroupMap = new Map<string, BidGroup>();

	for (const page of pageResults) {
		const d = page.data;

		if (d.project && typeof d.project === "object") {
			Object.assign(projectInfo, d.project);
		}

		if (page.pageType === "cover" && d.project) {
			Object.assign(projectInfo, d.project);
		}

		// Bid ranking → bidder identities
		if (page.pageType === "bid_ranking" && Array.isArray(d.bidders)) {
			for (const b of d.bidders as {
				rank?: number;
				name: string;
				totalBaseBid?: number;
				address?: string;
			}[]) {
				if (!bidderMap.has(b.name)) {
					bidderMap.set(b.name, {
						rank: b.rank ?? bidderMap.size + 1,
						name: b.name,
						totalBaseBid: b.totalBaseBid,
						address: b.address,
					});
				} else {
					const existing = bidderMap.get(b.name)!;
					if (b.totalBaseBid) existing.totalBaseBid = b.totalBaseBid;
					if (b.address) existing.address = b.address;
				}
			}
		}

		// Bid tabulation → hierarchical structure
		if (page.pageType === "bid_tabulation" && Array.isArray(d.sections)) {
			const groupName = (d.bidGroupName as string) || "Base Bid";
			const groupType = (d.bidGroupType as string) || "base";

			if (!bidGroupMap.has(groupName)) {
				bidGroupMap.set(groupName, {
					type: groupType as BidGroup["type"],
					name: groupName,
					sections: [],
					totals: (d.totals as Record<string, number>) || undefined,
				});
			}
			const group = bidGroupMap.get(groupName)!;

			if (d.totals && typeof d.totals === "object") {
				group.totals = {
					...(group.totals || {}),
					...(d.totals as Record<string, number>),
				};
			}

			for (const rawSection of d.sections as {
				name?: string;
				items?: Record<string, unknown>[];
				subtotals?: Record<string, number>;
			}[]) {
				const sectionName = rawSection.name || "";
				let section = group.sections.find((s) => s.name === sectionName);
				if (!section) {
					section = { name: sectionName, items: [] };
					group.sections.push(section);
				}

				if (rawSection.subtotals) {
					section.subtotals = {
						...(section.subtotals || {}),
						...rawSection.subtotals,
					};
				}

				for (const rawItem of rawSection.items ?? []) {
					const item: Item = {
						itemNo: rawItem.itemNo as string | number,
						description: rawItem.description as string,
						unit: rawItem.unit as string | undefined,
						quantity: rawItem.quantity as number | undefined,
						bids:
							(rawItem.bids as Record<
								string,
								{ unitPrice?: number; extendedPrice?: number }
							>) || {},
						engineerEstimate: rawItem.engineerEstimate as
							| { unitPrice?: number; extendedPrice?: number }
							| undefined,
					};

					if (Array.isArray(rawItem.subItems)) {
						item.subItems = (
							rawItem.subItems as Record<string, unknown>[]
						).map((si) => ({
							itemNo: si.itemNo as string | number,
							description: si.description as string,
							unit: si.unit as string | undefined,
							quantity: si.quantity as number | undefined,
							bids:
								(si.bids as Record<
									string,
									{ unitPrice?: number; extendedPrice?: number }
								>) || {},
							engineerEstimate: si.engineerEstimate as
								| { unitPrice?: number; extendedPrice?: number }
								| undefined,
						}));
					}

					section.items.push(item);

					// Collect bidder names
					for (const name of Object.keys(item.bids)) {
						if (!bidderMap.has(name)) {
							bidderMap.set(name, {
								rank: bidderMap.size + 1,
								name,
							});
						}
					}
				}
			}
		}

		if (page.pageType === "summary" && d.engineerEstimate) {
			engTotal = d.engineerEstimate as number;
		}
	}

	const contracts: Contract[] = [];
	if (bidGroupMap.size > 0) {
		contracts.push({
			name: "Contract 1",
			bidGroups: Array.from(bidGroupMap.values()),
		});
	}

	// Compute engineer estimate total from per-item data
	let computedEngTotal = 0;
	for (const contract of contracts) {
		for (const group of contract.bidGroups) {
			for (const section of group.sections) {
				for (const item of section.items) {
					if (item.engineerEstimate?.extendedPrice) {
						computedEngTotal += item.engineerEstimate.extendedPrice;
					}
				}
			}
		}
	}

	const bidders = Array.from(bidderMap.values()).sort(
		(a, b) => a.rank - b.rank,
	);

	return {
		sourceFile,
		project: projectInfo.name
			? (projectInfo as unknown as BidTabulation["project"])
			: { name: sourceFile.replace(".pdf", "") },
		contracts,
		bidders,
		engineerEstimate: engTotal
			? { total: engTotal }
			: computedEngTotal > 0
				? { total: Math.round(computedEngTotal * 100) / 100 }
				: undefined,
		extraction: {
			formatType: "unknown",
			confidence: 0,
			pagesProcessed: pageResults.length,
			warnings: [],
			processingTimeMs: 0,
		},
	};
}

// -- Scoring --

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

import type { Bidder } from "./schemas/bid-tabulation.js";

function computeMathScore(bidders: Bidder[]): number {
	let total = 0;
	let correct = 0;
	for (const bidder of bidders) {
		for (const item of bidder.lineItems ?? []) {
			if (
				item.unitPrice != null &&
				item.quantity != null &&
				item.extendedPrice != null
			) {
				total++;
				const expected =
					Math.round(item.unitPrice * item.quantity * 100) / 100;
				if (Math.abs(expected - item.extendedPrice) <= 0.01) correct++;
			}
		}
	}
	return total === 0 ? 100 : Math.round((correct / total) * 100);
}

function computeCompletenessScore(
	data: BidTabulation,
	legacyBidders: Bidder[],
	classification: { bidderCount: number; hasLineItems: boolean },
): number {
	let score = 100;
	if (data.bidders.length < classification.bidderCount) {
		score = Math.round(
			score * (data.bidders.length / classification.bidderCount),
		);
	}
	if (classification.hasLineItems) {
		const withItems = legacyBidders.filter(
			(b) => b.lineItems && b.lineItems.length > 0,
		).length;
		if (withItems === 0) score = Math.round(score * 0.2);
		else if (withItems < data.bidders.length)
			score = Math.round(score * (withItems / data.bidders.length));
	}
	return score;
}
