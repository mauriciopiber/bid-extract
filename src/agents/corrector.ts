/**
 * Corrector Agent
 *
 * Takes extraction results + validation errors + original images,
 * asks the model to fix the specific issues found.
 */

import Anthropic from "@anthropic-ai/sdk";
import type { BidTabulation } from "../schemas/bid-tabulation.js";
import { parseJsonResponse } from "../utils/parse-json.js";

const client = new Anthropic();

export async function correctExtraction(
	pageImages: Buffer[],
	data: BidTabulation,
	warnings: string[],
	errors: { field: string; message: string }[],
): Promise<BidTabulation> {
	const issues = [
		...errors.map((e) => `ERROR: ${e.message}`),
		...warnings.map((w) => `WARNING: ${w}`),
	];

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

	const prompt = `I previously extracted bid data from this document but the validation found issues.

Here is the current extracted data:
${JSON.stringify(data, null, 2)}

These issues were found:
${issues.map((i) => `- ${i}`).join("\n")}

Please look at the original document images again carefully and fix the issues.

Common mistakes to check:
- Unit prices confused with extended/total prices (unitPrice × quantity should = extendedPrice)
- Numbers misread (e.g., commas, decimal points)
- Line items summing incorrectly to totals
- Missing bidders or line items

IMPORTANT — Lump sum and flat-total items:
- If unitPrice × quantity doesn't equal extendedPrice, the most likely fix is to REMOVE unitPrice (set it to undefined/omit it), not to recalculate it
- Many bid items are priced as a flat total — the bidder says "I'll do 700 FT for $30,000" with no per-unit price. In this case, only extendedPrice should be set.
- When unit is "LS" and quantity is 1, unitPrice and extendedPrice should be the same number
- NEVER fix a math mismatch by dividing extendedPrice / quantity to get unitPrice — that creates fabricated data

Respond with ONLY the corrected full JSON (no markdown, no code fences). Keep the same structure, just fix the values that are wrong. If a math warning can't be resolved by reading the document more carefully, remove the unitPrice field rather than fabricating one.`;

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

	// Preserve extraction metadata from original
	return {
		sourceFile: data.sourceFile,
		project: raw.project || data.project,
		engineerEstimate: raw.engineerEstimate || data.engineerEstimate,
		bidders: raw.bidders || data.bidders,
		extraction: data.extraction,
	};
}
