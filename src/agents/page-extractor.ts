/**
 * Page Extractor
 *
 * Extracts data from a SINGLE page based on its page type.
 * KEY INSIGHT: each page receives the context from previous pages
 * (bidder names, column positions) so the merge is trivial.
 *
 * Page 1: "Who are the bidders?" → establishes identity
 * Page 2+: "These are the bidders: [list]. Extract their data." → fills in rows
 */

import Anthropic from "@anthropic-ai/sdk";
import type { PageClassification } from "./classifier.js";
import { parseJsonResponse } from "../utils/parse-json.js";

const client = new Anthropic();

export interface PageExtractionResult {
	pageNumber: number;
	pageType: string;
	data: Record<string, unknown>;
}

/** Context passed from previous pages to the current one */
export interface PageContext {
	/** Bidder names established from previous pages */
	bidderNames: string[];
	/** Engineer estimate column present? */
	hasEngineerEstimate: boolean;
	/** Section headers seen so far */
	sections: string[];
	/** Is this a continuation of a table from a previous page? */
	isContinuation: boolean;
}

function buildBidTabulationPrompt(context: PageContext): string {
	const bidderContext = context.bidderNames.length > 0
		? `IMPORTANT: The bidders in this document are (in column order):
${context.bidderNames.map((n, i) => `  Column ${i + 1}: "${n}"`).join("\n")}

You MUST use these EXACT bidder names. Do NOT create new bidder names. Map each column's values to the correct bidder.
${context.isContinuation ? "\nThis page is a CONTINUATION of a table from the previous page. The columns are the same." : ""}`
		: `This is the FIRST page with bid data. Identify ALL bidder names from the column headers.`;

	return `Extract bid tabulation data from this page.

${bidderContext}

Respond with ONLY valid JSON:
{
  "bidders": ${context.bidderNames.length > 0
		? `["${context.bidderNames.join('", "')}"]`
		: '["list of bidder names from column headers"]'},
  "sections": [
    {
      "name": "section name if visible (e.g., Bridge Items, Roadway Items)",
      "items": [
        {
          "itemNo": "1",
          "description": "Item description",
          "unit": "LS",
          "quantity": 1,
          "bids": {
            "Bidder Name": {"unitPrice": 100.00, "extendedPrice": 100.00},
            "Other Bidder": {"unitPrice": 120.00, "extendedPrice": 120.00}
          }${context.hasEngineerEstimate ? ',\n          "engineerEstimate": {"unitPrice": 90.00, "extendedPrice": 90.00}' : ""}
        }
      ]
    }
  ],
  "continuedFromPrevious": ${context.isContinuation},
  "continuedOnNext": false
}

Rules:
- Use the EXACT bidder names provided (or from headers if first page)
- The "bids" object keys MUST match the bidder names exactly
- If items have sub-items (a, b, c under item 1), use itemNo like "1a", "1b"
- All monetary values as numbers (no $ signs, no commas)
- Only set unitPrice if explicitly shown — NEVER back-calculate
- If a section header is visible, set the section name`;
}

function buildBidRankingPrompt(): string {
	return `Extract the bid ranking from this page. This shows bidder names and total amounts.

Respond with ONLY valid JSON:
{
  "bidders": [
    {"rank": 1, "name": "Company Name", "totalBaseBid": 500000, "address": "if visible"}
  ],
  "project": {
    "name": "project name if visible",
    "projectId": "ID if visible",
    "owner": "owner if visible",
    "bidDate": "date if visible"
  }
}

Rules:
- Rank 1 = lowest bidder
- All monetary values as numbers
- Do NOT fabricate line items`;
}

function buildCoverPrompt(): string {
	return `Extract project information from this cover page.

Respond with ONLY valid JSON:
{
  "project": {
    "name": "project name/title",
    "projectId": "project number/ID",
    "owner": "owner entity",
    "bidDate": "bid opening date",
    "location": "project location",
    "description": "project description/scope"
  },
  "engineer": "engineering firm name if visible",
  "contracts": ["list of contract names if multiple"]
}`;
}

function buildGenericPrompt(): string {
	return `Describe what you see on this page. Respond with ONLY valid JSON:
{"description": "what this page contains", "hasRelevantData": false}`;
}

export async function extractPage(
	pageImage: Buffer,
	classification: PageClassification,
	context: PageContext,
): Promise<PageExtractionResult> {
	let prompt: string;
	switch (classification.pageType) {
		case "bid_tabulation":
			prompt = buildBidTabulationPrompt(context);
			break;
		case "bid_ranking":
			prompt = buildBidRankingPrompt();
			break;
		case "cover":
			prompt = buildCoverPrompt();
			break;
		default:
			prompt = buildGenericPrompt();
			break;
	}

	const response = await client.messages.create({
		model: "claude-sonnet-4-20250514",
		max_tokens: 8192,
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
	const data = parseJsonResponse<Record<string, unknown>>(text);

	return {
		pageNumber: classification.pageNumber,
		pageType: classification.pageType,
		data,
	};
}

/** Extract bidder names from a page result to use as context for next pages */
export function extractBidderNames(
	result: PageExtractionResult,
): string[] {
	const d = result.data;

	// From bid_tabulation: bidders array
	if (Array.isArray(d.bidders) && d.bidders.length > 0) {
		if (typeof d.bidders[0] === "string") return d.bidders as string[];
		return (d.bidders as { name: string }[]).map((b) => b.name);
	}

	// From sections → bids keys
	if (Array.isArray(d.sections)) {
		const names = new Set<string>();
		for (const section of d.sections as { items?: Record<string, unknown>[] }[]) {
			for (const item of section.items ?? []) {
				const bids = item.bids as Record<string, unknown> | undefined;
				if (bids) {
					for (const name of Object.keys(bids)) {
						names.add(name);
					}
				}
			}
		}
		if (names.size > 0) return Array.from(names);
	}

	return [];
}
