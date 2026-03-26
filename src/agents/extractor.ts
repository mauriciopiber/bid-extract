/**
 * Extractor Agent
 *
 * Takes classified page images and extracts structured bid data.
 * Uses the classification to select the right extraction prompt/strategy.
 */

import Anthropic from "@anthropic-ai/sdk";
import { buildFewShotPrompt, getExample } from "../registry.js";
import type { BidTabulation, FormatType } from "../schemas/bid-tabulation.js";
import { parseJsonResponse } from "../utils/parse-json.js";
import type { ClassificationResult } from "./classifier.js";

const client = new Anthropic();

function buildExtractionPrompt(classification: ClassificationResult): string {
	const formatHints: Record<FormatType, string> = {
		"simple-table": `This is a simple table format with ${classification.bidderCount} bidder(s). Extract all line items with item numbers, descriptions, units, quantities, unit prices, and extended prices.`,
		"multi-bidder-matrix": `This is a wide matrix format with ${classification.bidderCount} bidders across columns. Each row is a line item. Extract data for ALL bidders, reading carefully across columns.`,
		"summary-only": `This document only has bidder names and total amounts — no line item breakdown. Extract bidder names, totals, and ranks. Do NOT fabricate line items.`,
		"engineering-firm": `This is a formal engineering bid form with item codes, descriptions, units, quantities, unit prices, and extended prices. May have schedules or sections.`,
		"multi-section": `This document has a base bid section plus alternate bid sections. Extract the base bid AND each alternate separately.`,
		handwritten: `This document contains handwritten values. Read carefully. If a value is unclear, use your best interpretation and flag it in notes. Set confidence lower for uncertain values.`,
		"submission-list": `This is just a list of submissions — supplier names and dates. Extract what's available. There may be no prices.`,
		unknown: `Format is unknown. Extract whatever structured data you can find.`,
	};

	const hint = formatHints[classification.formatType] || formatHints.unknown;

	return `You are extracting structured bid tabulation data from a document image.

${hint}

${classification.hasEngineerEstimate ? "An engineer's estimate is present — extract it." : ""}
${classification.hasAlternates ? "Alternate bids are present — extract them in the alternates array." : ""}

Respond with ONLY valid JSON (no markdown, no code fences) matching this structure:
{
  "project": {
    "name": "project name/title",
    "projectId": "project number if visible",
    "owner": "county/city/entity name",
    "bidDate": "date string if visible",
    "location": "location if visible",
    "description": "brief scope description if visible"
  },
  "engineerEstimate": {
    "total": number or null,
    "lineItems": [{"itemNo": "1", "description": "...", "unit": "LS", "quantity": 1, "unitPrice": 100, "extendedPrice": 100}] or null
  },
  "bidders": [
    {
      "rank": 1,
      "name": "Company Name",
      "address": "address if visible",
      "phone": "phone if visible",
      "totalBaseBid": total number,
      "totalBid": total including alternates if different,
      "lineItems": [
        {"itemNo": "1", "description": "...", "section": "Bridge Items", "unit": "LS", "quantity": 1, "unitPrice": 100.00, "extendedPrice": 100.00}
      ],
      "alternates": [
        {"name": "Alternate 1", "total": 5000, "lineItems": [...]}
      ]
    }
  ]
}

Rules:
- Rank 1 = lowest bidder / apparent winner
- All monetary values as numbers (no $ signs, no commas)
- If a value is not present, omit the field (don't use null)
- If ranks are not explicitly shown, rank by total base bid (lowest = 1)
- Extract ALL bidders visible in the document
- For line items, preserve the original item numbers
- If the document groups line items under section headers (e.g., "Bridge Items", "Roadway Items", "Earthwork", "Drainage"), include the "section" field on each line item with the EXACT section name as shown in the document. This is critical for grouping and subtotals.
- If there are section subtotals visible, make sure the line items in each section sum to those subtotals

CRITICAL rules for prices and lump sum items:
- Read column headers carefully. Identify which column is "Approx Qty", "Unit Price", and "Extended Price" / "Total"
- "Approximate Quantity" is NOT a price — it's a count (e.g., 700 FT, 2520 SF). Never confuse it with a dollar amount.
- Only set unitPrice if a per-unit price is EXPLICITLY shown as a separate column value in the document
- NEVER back-calculate unitPrice by dividing extendedPrice / quantity — this produces wrong numbers

Understanding Lump Sum (LS) items:
- When unit is "LS" and quantity is 1: unitPrice and extendedPrice are the SAME number. This is normal.
- When a bidder provides a FLAT TOTAL for a line item (e.g., "700 FT for $30,000"): there is NO unit price. Set only extendedPrice = 30000 and omit unitPrice. The bidder is saying "I'll do all 700 FT for $30,000 total" — not "$30,000 per FT".
- Some bid forms only have columns for quantity and total/extended — no unit price column at all. In that case, NEVER fabricate a unit price.

The validation rule: if you set both unitPrice and quantity, then unitPrice × quantity MUST equal extendedPrice exactly. If the math doesn't work, you're reading the wrong column or fabricating a value.`;
}

export async function extractBidData(
	pageImages: Buffer[],
	classification: ClassificationResult,
	sourceFile: string,
): Promise<BidTabulation> {
	const startTime = Date.now();

	const imageContent: Anthropic.Messages.ImageBlockParam[] = pageImages.map(
		(img) => ({
			type: "image" as const,
			source: {
				type: "base64" as const,
				media_type: "image/png" as const,
				data: img.toString("base64"),
			},
		}),
	);

	let prompt = buildExtractionPrompt(classification);

	// Add few-shot example from registry if available
	const example = await getExample(classification.formatType);
	if (example) {
		prompt = `${buildFewShotPrompt(example)}\n\n---\n\nNow extract from the new document:\n\n${prompt}`;
	}

	const response = await client.messages.create({
		model: "claude-sonnet-4-20250514",
		max_tokens: 8192,
		messages: [
			{
				role: "user",
				content: [...imageContent, { type: "text", text: prompt }],
			},
		],
	});

	const text =
		response.content[0].type === "text" ? response.content[0].text : "";

	// biome-ignore lint: LLM output is untyped
	const raw: any = parseJsonResponse(text);

	// Normalize into BidTabulation
	const result: BidTabulation = {
		sourceFile,
		project: raw.project || { name: "Unknown" },
		bidders: (raw.bidders || []).map(
			// biome-ignore lint: LLM output is untyped
			(b: any, i: number) => ({
				...b,
				rank: b.rank ?? i + 1,
			}),
		),
		extraction: {
			formatType: classification.formatType,
			confidence: classification.confidence,
			pagesProcessed: pageImages.length,
			warnings: [],
			processingTimeMs: Date.now() - startTime,
		},
	};

	if (raw.engineerEstimate?.total) {
		result.engineerEstimate = raw.engineerEstimate;
	}

	return result;
}
