/**
 * Contest Resolver
 *
 * Re-examines specific contested values by sending the original
 * page image with a focused prompt asking about just that value.
 * Uses higher DPI for better character-level accuracy.
 */

import Anthropic from "@anthropic-ai/sdk";
import type { Contest } from "../contests.js";
import { parseJsonResponse } from "../utils/parse-json.js";

const client = new Anthropic();

interface ResolverResult {
	value: unknown;
	confidence: number;
	explanation: string;
}

export async function resolveContest(
	pageImages: Buffer[],
	contest: Contest,
	// biome-ignore lint: dynamic extraction data
	extractionData: any,
): Promise<ResolverResult> {
	const imageContent: Anthropic.Messages.ImageBlockParam[] =
		pageImages.map((img) => ({
			type: "image" as const,
			source: {
				type: "base64" as const,
				media_type: "image/png" as const,
				data: img.toString("base64"),
			},
		}));

	const prompt = `I'm reviewing an extracted bid tabulation and a specific value has been contested as potentially incorrect.

CONTESTED VALUE:
- Field: ${contest.fieldPath}
- Current extracted value: ${JSON.stringify(contest.currentValue)}
- Reason for contest: ${contest.reason}
${contest.suggestedValue != null ? `- Reviewer suggests it should be: ${JSON.stringify(contest.suggestedValue)}` : ""}

CONTEXT from the full extraction:
${JSON.stringify(extractionData, null, 2)}

Please look VERY carefully at the document image and find this specific value. Read each digit individually. Pay attention to:
- Characters that look similar: 6/8, 3/8, 5/6, 1/7, 0/6/9
- Decimal points that might be missed
- Commas in numbers
- Whether this is a unit price, extended price, or quantity

Respond with ONLY valid JSON:
{
  "value": the correct value you see in the document,
  "confidence": 0-1 how confident you are,
  "explanation": "what you see in the document and why"
}`;

	const response = await client.messages.create({
		model: "claude-sonnet-4-20250514",
		max_tokens: 1024,
		messages: [
			{
				role: "user",
				content: [...imageContent, { type: "text", text: prompt }],
			},
		],
	});

	const text =
		response.content[0].type === "text" ? response.content[0].text : "";

	const result = parseJsonResponse<ResolverResult>(text);

	// Coerce numeric values — the model sometimes returns "2715.00" as a string
	if (
		typeof result.value === "string" &&
		/^[\d,]+\.?\d*$/.test(result.value.replace(/,/g, ""))
	) {
		result.value = Number.parseFloat(result.value.replace(/,/g, ""));
	}

	return result;
}
