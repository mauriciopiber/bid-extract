/**
 * Classifier Agent
 *
 * Takes a PDF (as page images) and determines:
 * - Format type (simple table, multi-bidder matrix, handwritten, etc.)
 * - Number of bidders
 * - Whether line items are present
 * - Whether alternates exist
 * - Whether handwriting is present
 * - Recommended extraction strategy
 */

import Anthropic from "@anthropic-ai/sdk";
import type { FormatType } from "../schemas/bid-tabulation.js";
import { parseJsonResponse } from "../utils/parse-json.js";

export interface ClassificationResult {
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

const CLASSIFICATION_PROMPT = `You are analyzing a bid tabulation document. Look at the page image(s) and classify this document.

Respond with ONLY valid JSON (no markdown, no code fences) matching this exact structure:
{
  "formatType": one of: "simple-table", "multi-bidder-matrix", "summary-only", "engineering-firm", "multi-section", "handwritten", "submission-list", "unknown",
  "confidence": number 0-1,
  "bidderCount": number of bidders visible,
  "hasLineItems": boolean - are individual line items with quantities/prices shown?,
  "hasAlternates": boolean - are there alternate bid sections?,
  "hasHandwriting": boolean - are there handwritten values?,
  "hasEngineerEstimate": boolean - is an engineer's estimate shown?,
  "notes": "brief description of what you see"
}

Format type definitions:
- "simple-table": Clean table layout, few bidders (1-3), line items visible
- "multi-bidder-matrix": Wide table with many bidders (4+) across columns, line items in rows
- "summary-only": Just bidder names and total amounts, no line item breakdown
- "engineering-firm": Formal engineering template with item codes, unit prices, schedules
- "multi-section": Has base bid plus alternate bid sections
- "handwritten": Contains handwritten values (scanned form)
- "submission-list": Just a list of supplier names and submission dates, no prices
- "unknown": Cannot determine format`;

const client = new Anthropic();

export async function classifyDocument(
	pageImages: Buffer[],
): Promise<ClassificationResult> {
	// Send first 2 pages max for classification
	const imagesToSend = pageImages.slice(0, 2);

	const imageContent: Anthropic.Messages.ImageBlockParam[] = imagesToSend.map(
		(img) => ({
			type: "image" as const,
			source: {
				type: "base64" as const,
				media_type: "image/png" as const,
				data: img.toString("base64"),
			},
		}),
	);

	const response = await client.messages.create({
		model: "claude-sonnet-4-20250514",
		max_tokens: 1024,
		messages: [
			{
				role: "user",
				content: [
					...imageContent,
					{ type: "text", text: CLASSIFICATION_PROMPT },
				],
			},
		],
	});

	const text =
		response.content[0].type === "text" ? response.content[0].text : "";

	const result = parseJsonResponse<ClassificationResult>(text);
	result.pageCount = pageImages.length;

	return result;
}
