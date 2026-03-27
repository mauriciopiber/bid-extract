/**
 * Generate a draft reference by running extraction on a sample.
 * The output is in the real BidTabulation schema.
 * Human must review and verify before it becomes ground truth.
 *
 * Usage:
 *   npx tsx evals/scripts/generate-reference.ts --sample=S02
 */

import "dotenv/config";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { generateObject } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { PageExtractionSchema } from "../../src/schemas/zod.js";

const EVALS_DIR = join(import.meta.dirname, "..");
const FILES_DIR =
	process.env.BID_FILES_DIR ||
	"/Users/mauriciopiber/Projects/edge/bid-extract-files";

const SAMPLES: Record<
	string,
	{ pdfFile: string; pageNumber: number; description: string }
> = {
	S01: {
		pdfFile: "Bid_Results_Anderson_Waster_System_Improvements.pdf",
		pageNumber: 1,
		description: "Anderson Waste p1",
	},
	S02: {
		pdfFile: "Bid_Results_Andrew_Bridge_2350005.pdf",
		pageNumber: 1,
		description: "Andrew Bridge",
	},
	S03: {
		pdfFile: "Bid_Results_Bollinger_Co_Road_416_Bridge.pdf",
		pageNumber: 1,
		description: "Bollinger Co ranking",
	},
	S04: {
		pdfFile: "Bid_Results_Eldon_First_Street_Storm_Sewer_Improvements_2025.pdf",
		pageNumber: 1,
		description: "Eldon Storm Sewer",
	},
	S05: {
		pdfFile: "Bid_Results_Barry_Co_Barry_County_Farm_Rd_2070.pdf",
		pageNumber: 1,
		description: "Barry Co matrix",
	},
};

// Schema imported from src/schemas/zod.ts — single source of truth

async function main() {
	const args = process.argv.slice(2);
	const params: Record<string, string> = {};
	for (const arg of args) {
		const [key, value] = arg.replace("--", "").split("=");
		params[key] = value;
	}

	const sample = params.sample;
	if (!sample || !SAMPLES[sample]) {
		console.log("Available samples:", Object.keys(SAMPLES).join(", "));
		console.log("Usage: npx tsx evals/scripts/generate-reference.ts --sample=S02");
		process.exit(1);
	}

	const sampleConfig = SAMPLES[sample];
	const refPath = join(EVALS_DIR, "reference", `${sample}.json`);

	if (existsSync(refPath)) {
		const existing = JSON.parse(readFileSync(refPath, "utf-8"));
		if (existing.verified) {
			console.log(`${sample} is already verified. Not overwriting.`);
			process.exit(0);
		}
	}

	// Load sample image
	const imagePath = join(EVALS_DIR, "samples", `${sample}.png`);
	if (!existsSync(imagePath)) {
		console.log(`No image. Run: npx tsx evals/scripts/prepare-samples.ts`);
		process.exit(1);
	}
	const image = readFileSync(imagePath);

	console.log(`\nGenerating reference for ${sample}: ${sampleConfig.description}`);
	console.log(`Using BidTabulation schema...\n`);

	const { object } = await generateObject({
		model: anthropic("claude-sonnet-4-20250514"),
		maxTokens: 16384,
		schema: PageExtractionSchema,
		messages: [
			{
				role: "user",
				content: [
					{ type: "image", image },
					{
						type: "text",
						text: `Extract ALL data from this bid tabulation page into the exact schema provided.

This is a bid tabulation document. Extract:
- Project info (name, owner, date, ID)
- ALL bidder names, ranks, and totals
- ALL contracts/schedules
- ALL bid groups (base bid, supplemental, alternates)
- ALL sections with their items
- ALL line items with bids per bidder (unitPrice + extendedPrice)
- Engineer estimate per item if visible
- Section subtotals and bid group totals if visible

Rules:
- Use exact names from the document
- All monetary values as numbers
- Only set unitPrice if explicitly shown
- Extract EVERY item — do NOT stop early
- Include sub-items if present (1a, 1b under item 1)`,
					},
				],
			},
		],
	});

	// Build reference file
	const reference = {
		verified: false,
		verifiedBy: null,
		verifiedAt: null,
		sample,
		pdfFile: sampleConfig.pdfFile,
		pageNumber: sampleConfig.pageNumber,
		...object,
	};

	writeFileSync(refPath, JSON.stringify(reference, null, 2) + "\n");

	// Print summary
	console.log(`Bidders: ${object.bidders.map((b) => `#${b.rank} ${b.name} ($${b.totalBaseBid})`).join(", ")}`);
	console.log(`Bid Group: ${object.bidGroupName} (${object.bidGroupType})`);
	console.log(`Items: ${object.items.length}`);
	if (object.engineerEstimate) {
		console.log(`Engineer estimate total: $${object.engineerEstimate.total}`);
	}

	console.log(`\nSaved: evals/reference/${sample}.json`);
	console.log(`\nNext: review and verify:`);
	console.log(`  npx tsx evals/scripts/review.ts --sample=${sample}`);
	console.log(`  npx tsx evals/scripts/verify.ts --sample=${sample} --by=mauricio`);

	process.exit(0);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
