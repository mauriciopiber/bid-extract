/**
 * Classifier Agent
 *
 * Two levels of classification:
 * 1. Page-level: what type is each page (dynamic — types come from DB)
 * 2. Document-level: aggregate page classifications into overall understanding
 */

import Anthropic from "@anthropic-ai/sdk";
import type { FormatType } from "../schemas/bid-tabulation.js";
import { parseJsonResponse } from "../utils/parse-json.js";
import { db, schema } from "../db/index.js";

// -- Types --

export interface PageClassification {
	pageNumber: number;
	pageType: string;
	confidence: number;
	notes: string;
	hasLineItems: boolean;
	hasUnitPrices: boolean;
	bidderCount: number;
	sections: string[];
	hasHandwriting: boolean;
	hasEngineerEstimate: boolean;
}

export interface DocumentClassification {
	pages: PageClassification[];
	formatType: FormatType;
	confidence: number;
	bidderCount: number;
	hasLineItems: boolean;
	hasAlternates: boolean;
	hasHandwriting: boolean;
	hasEngineerEstimate: boolean;
	pageCount: number;
	notes: string;
}

// Backward compat
export type ClassificationResult = DocumentClassification;

const client = new Anthropic();

/** Build classification prompt dynamically from DB page types */
async function buildPagePrompt(): Promise<string> {
	const types = await db.select().from(schema.pageTypes);

	const typeList = types.length > 0
		? types.map((t) => `- "${t.name}": ${t.description}`).join("\n")
		: `- "bid_tabulation": Line items with quantities, unit prices, extended prices
- "bid_ranking": Bidder names + total amounts only, no line items
- "cover": Project info page
- "summary": Totals, low bidder announcement
- "other": Not bid-related`;

	const typeNames = types.length > 0
		? types.map((t) => `"${t.name}"`).join(", ")
		: '"bid_tabulation", "bid_ranking", "cover", "summary", "other"';

	return `You are classifying a SINGLE PAGE of a bid document.

Respond with ONLY valid JSON (no markdown, no code fences):
{
  "pageType": one of: ${typeNames},
  "confidence": number 0-1,
  "notes": "brief description of what you see",
  "hasLineItems": boolean - line items with descriptions/quantities/prices?,
  "hasUnitPrices": boolean - per-unit prices shown (not just totals)?,
  "bidderCount": number of bidders visible (0 if none),
  "sections": array of section headers visible (e.g., ["Bridge Items", "Roadway Items"]),
  "hasHandwriting": boolean,
  "hasEngineerEstimate": boolean
}

Page type definitions:
${typeList}

IMPORTANT distinctions:
- "bid_ranking" = just names and totals. NO line items.
- "bid_tabulation" = line items with item numbers, descriptions, quantities, prices.
- If a page doesn't match any known type, use the closest match and note what's different.`;
}

/** Classify a single page */
export async function classifyPage(
	pageImage: Buffer,
	pageNumber: number,
): Promise<PageClassification> {
	const prompt = await buildPagePrompt();

	const response = await client.messages.create({
		model: "claude-sonnet-4-20250514",
		max_tokens: 1024,
		messages: [
			{
				role: "user",
				content: [
					{
						type: "image",
						source: {
							type: "base64",
							media_type: "image/png",
							data: pageImage.toString("base64"),
						},
					},
					{ type: "text", text: prompt },
				],
			},
		],
	});

	const text =
		response.content[0].type === "text" ? response.content[0].text : "";
	const result = parseJsonResponse<Omit<PageClassification, "pageNumber">>(
		text,
	);

	return { ...result, pageNumber };
}

/** Classify all pages and build document-level classification */
export async function classifyDocument(
	pageImages: Buffer[],
): Promise<DocumentClassification> {
	const pages: PageClassification[] = [];
	for (let i = 0; i < pageImages.length; i++) {
		const page = await classifyPage(pageImages[i], i + 1);
		pages.push(page);
	}

	// Derive document-level from page-level
	const tabPages = pages.filter((p) => p.pageType === "bid_tabulation");
	const rankPages = pages.filter((p) => p.pageType === "bid_ranking");
	const hasLineItems = tabPages.length > 0;

	let formatType: FormatType = "unknown";
	if (tabPages.length > 0) {
		const maxBidders = Math.max(...tabPages.map((p) => p.bidderCount));
		const hasHandwriting = tabPages.some((p) => p.hasHandwriting);
		const hasAlternates =
			tabPages.length > 1 ||
			pages.some((p) => p.sections.some((s) => /alternate|alt\s/i.test(s)));

		if (hasHandwriting) {
			formatType = "handwritten";
		} else if (hasAlternates) {
			formatType = "multi-section";
		} else if (maxBidders >= 4) {
			formatType = "multi-bidder-matrix";
		} else if (tabPages.some((p) => p.hasUnitPrices)) {
			formatType = "engineering-firm";
		} else {
			formatType = "simple-table";
		}
	} else if (rankPages.length > 0) {
		formatType = "summary-only";
	}

	const allBidderCounts = pages
		.map((p) => p.bidderCount)
		.filter((c) => c > 0);
	const bidderCount =
		allBidderCounts.length > 0 ? Math.max(...allBidderCounts) : 0;

	return {
		pages,
		formatType,
		confidence: pages.reduce((s, p) => s + p.confidence, 0) / pages.length,
		bidderCount,
		hasLineItems,
		hasAlternates: pages.some((p) =>
			p.sections.some((s) => /alternate|alt\s/i.test(s)),
		),
		hasHandwriting: pages.some((p) => p.hasHandwriting),
		hasEngineerEstimate: pages.some((p) => p.hasEngineerEstimate),
		pageCount: pageImages.length,
		notes: pages
			.map((p) => `p${p.pageNumber}: ${p.pageType} — ${p.notes}`)
			.join(" | "),
	};
}
