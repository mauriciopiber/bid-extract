/**
 * Test: extract page 1 of Anderson Waste using generateObject + Zod schema.
 * This should eliminate JSON parse errors and force complete extraction.
 */

import "dotenv/config";
import { generateObject } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";
import { pdfToImages } from "../src/utils/pdf-to-images.js";

const BidValueSchema = z.object({
	unitPrice: z.number().optional(),
	extendedPrice: z.number().optional(),
});

const ItemSchema = z.object({
	itemNo: z.string(),
	description: z.string(),
	unit: z.string().optional(),
	quantity: z.number().optional(),
	bids: z.record(z.string(), BidValueSchema),
	engineerEstimate: BidValueSchema.optional(),
});

// Flat schema — items have a sectionName field instead of nested sections array
// Claude handles flat arrays better than deeply nested structures
const PageExtractionSchema = z.object({
	bidders: z.array(z.string()),
	bidGroupType: z.string(),
	bidGroupName: z.string(),
	items: z.array(
		ItemSchema.extend({
			sectionName: z.string().optional(),
		}),
	),
	totals: z.record(z.string(), z.number()).optional(),
	continuedFromPrevious: z.boolean(),
	continuedOnNext: z.boolean(),
});

async function main() {
	const pages = await pdfToImages(
		"/tmp/bid-tabs/Bid_Results_Anderson_Waster_System_Improvements.pdf",
	);
	console.log(`Page 1 image: ${pages[0].image.length} bytes\n`);

	console.log("Extracting with generateObject...\n");
	const startTime = Date.now();

	const { object, usage } = await generateObject({
		model: anthropic("claude-sonnet-4-20250514"),
		maxTokens: 16384,
		schema: PageExtractionSchema,
		messages: [
			{
				role: "user",
				content: [
					{
						type: "image",
						image: pages[0].image,
					},
					{
						type: "text",
						text: `Extract ALL bid tabulation data from this page.

This page contains approximately 20 line items across multiple sections.
There are 3 bidder columns plus an engineer's estimate column.

Extract EVERY item. Do NOT stop early.

Rules:
- Use exact bidder names from column headers
- For each bid, use the object format: {"unitPrice": 100, "extendedPrice": 500} — NEVER use a plain number
- Only set unitPrice if explicitly shown as a separate column value
- All monetary values as numbers
- Include section headers as section names
- Set continuedOnNext=true if the table continues on the next page`,
					},
				],
			},
		],
	});

	const elapsed = Date.now() - startTime;
	console.log(`Done in ${elapsed}ms`);
	console.log(`Tokens: ${JSON.stringify(usage)}\n`);

	console.log(`Bidders: ${object.bidders.join(", ")}`);
	console.log(`BidGroup: ${object.bidGroupName} (${object.bidGroupType})`);
	console.log(`Items: ${object.items.length}`);

	for (const item of object.items) {
		const bidderPrices = Object.entries(item.bids)
			.map(([name, bid]) => `${name.slice(0, 12)}: ${bid.extendedPrice ?? "?"}`)
			.join(" | ");
		console.log(
			`  ${String(item.itemNo).padEnd(4)} ${(item.sectionName || "").slice(0, 20).padEnd(22)} ${item.description.slice(0, 40).padEnd(42)} ${item.unit?.padEnd(4) || "    "} ${String(item.quantity ?? "").padEnd(6)} ${bidderPrices}`,
		);
	}

	console.log(`\nTotal items: ${object.items.length}`);
	if (object.totals) {
		console.log(`Totals: ${JSON.stringify(object.totals)}`);
	}
	console.log(`ContinuedOnNext: ${object.continuedOnNext}`);

	process.exit(0);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
