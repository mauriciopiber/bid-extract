/**
 * Run extraction on a sample and save results.
 *
 * Usage:
 *   npx tsx evals/scripts/run.ts --sample=S01 --extractor=E1 --prompt=PR1
 *   npx tsx evals/scripts/run.ts --sample=S01 --extractor=E1 --prompt=PR1 --runs=3
 */

import "dotenv/config";
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { generateObject } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { PageExtractionSchema } from "../../src/schemas/zod.js";
import { pdfToImages } from "../../src/utils/pdf-to-images.js";

const EVALS_DIR = join(import.meta.dirname, "..");

// -- Registries --

const SAMPLES: Record<string, { pdfFile: string; pageNumber: number }> = {
	S01: {
		pdfFile: "Bid_Results_Anderson_Waster_System_Improvements.pdf",
		pageNumber: 1,
	},
	S02: {
		pdfFile: "Bid_Results_Andrew_Bridge_2350005.pdf",
		pageNumber: 1,
	},
	S03: {
		pdfFile: "Bid_Results_Bollinger_Co_Road_416_Bridge.pdf",
		pageNumber: 1,
	},
	S04: {
		pdfFile: "Bid_Results_Eldon_First_Street_Storm_Sewer_Improvements_2025.pdf",
		pageNumber: 1,
	},
	S05: {
		pdfFile: "Bid_Results_Barry_Co_Barry_County_Farm_Rd_2070.pdf",
		pageNumber: 1,
	},
};

const EXTRACTORS: Record<string, { model: string; description: string }> = {
	E1: { model: "claude-sonnet-4-20250514", description: "Sonnet 4 + generateObject" },
};

const PROMPTS: Record<string, { id: string; text: string }> = {
	PR1: {
		id: "PR1",
		text: `Extract ALL bid tabulation data from this page.

This is a bid tabulation document. It shows line items with quantities and prices from multiple bidders.

Rules:
- Identify ALL bidder names from column headers
- Extract EVERY numbered line item row — do NOT stop early
- For each bid, use object format: {"unitPrice": N, "extendedPrice": N}
- Only set unitPrice if explicitly shown as a separate column value
- All monetary values as numbers (no $ signs, no commas)
- Set sectionName from any visible section headers
- Include supplemental items and alternates if visible on this page`,
	},
	PR2: {
		id: "PR2",
		text: `Extract ALL bid tabulation data from this page.

This is a bid tabulation document. It shows line items with quantities and prices from multiple bidders.

IMPORTANT — Engineer's Estimate:
- The "Engineer's Estimate" or "Engineer's Opinion of Cost" column is NOT a bidder
- Do NOT include it in the bidders array
- Instead, extract it into the engineerEstimate field on each item
- The engineer's estimate also has a total — include it in the top-level engineerEstimate

IMPORTANT — Totals:
- Extract the total bid amount for each bidder (usually in a "Total Bid" row)
- Include bidder totals in the bidders array as totalBaseBid

IMPORTANT — Lump Sum:
- When unitPrice equals extendedPrice regardless of quantity, set isLumpSum: true
- This is common — the bidder gives a flat price for the entire item

Rules:
- Identify ALL bidder names from column headers (NOT the engineer's estimate)
- Extract EVERY numbered line item row — do NOT stop early
- For each bid, use object format: {"unitPrice": N, "extendedPrice": N}
- Only set unitPrice if explicitly shown as a separate column value
- All monetary values as numbers (no $ signs, no commas)
- Set sectionName from any visible section headers
- Include supplemental items and alternates if visible on this page`,
	},
	PR3: {
		id: "PR3",
		text: `Extract ALL bid tabulation data from this page.

This is a bid tabulation document. It shows line items with quantities and prices from multiple bidders.

IMPORTANT — Engineer's Estimate:
- The "Engineer's Estimate" or "Engineer's Opinion of Cost" column is NOT a bidder
- Do NOT include it in the bidders array
- Extract it into the engineerEstimate field on each item: {"unitPrice": N, "extendedPrice": N}
- Look for a TOTAL row for the engineer's estimate (e.g., "LS $150,000" or "Total Bid $150,000")
- You MUST set the top-level engineerEstimate: {"total": N} with that total amount from the total row

IMPORTANT — Bidder Totals:
- Look for a "Total Bid" or "Total Base Bid" row at the bottom of the table
- For each bidder, set totalBaseBid to their total from that row
- Every bidder MUST have totalBaseBid if a total row is visible

IMPORTANT — Lump Sum:
- When unitPrice equals extendedPrice regardless of quantity, set isLumpSum: true
- This is common — the bidder gives a flat price for the entire item

Rules:
- Identify ALL bidder names from column headers (NOT the engineer's estimate)
- Extract EVERY numbered line item row — do NOT stop early
- For each bid, use object format: {"unitPrice": N, "extendedPrice": N}
- Only set unitPrice if explicitly shown as a separate column value
- All monetary values as numbers (no $ signs, no commas)
- Set sectionName from any visible section headers
- Include supplemental items and alternates if visible on this page`,
	},
};

// Schema imported from src/schemas/zod.ts — single source of truth

// -- Runner --

async function runExtraction(
	sample: string,
	extractor: string,
	prompt: string,
	runNumber: number,
): Promise<RunResult> {
	const sampleConfig = SAMPLES[sample];
	const extractorConfig = EXTRACTORS[extractor];
	const promptConfig = PROMPTS[prompt];

	if (!sampleConfig) throw new Error(`Unknown sample: ${sample}`);
	if (!extractorConfig) throw new Error(`Unknown extractor: ${extractor}`);
	if (!promptConfig) throw new Error(`Unknown prompt: ${prompt}`);

	// Use pre-rendered sample image (600 DPI) if available, else render on the fly
	const sampleImagePath = join(EVALS_DIR, "samples", `${sample}.png`);
	let pageImage: Buffer;
	try {
		const { readFileSync } = await import("node:fs");
		pageImage = readFileSync(sampleImagePath);
	} catch {
		const FILES_DIR = process.env.BID_FILES_DIR || "/Users/mauriciopiber/Projects/edge/bid-extract-files";
		const pdfPath = join(FILES_DIR, "pdfs", sampleConfig.pdfFile);
		const pages = await pdfToImages(pdfPath);
		pageImage = pages[sampleConfig.pageNumber - 1].image;
	}

	console.log(`  Running ${extractor}/${prompt} on ${sample} (run ${runNumber})...`);
	const startTime = Date.now();

	try {
		const { object } = await generateObject({
			model: anthropic(extractorConfig.model),
			maxTokens: 16384,
			schema: PageExtractionSchema,
			messages: [
				{
					role: "user",
					content: [
						{ type: "image", image: pageImage },
						{ type: "text", text: promptConfig.text },
					],
				},
			],
		});

		const durationMs = Date.now() - startTime;

		return {
			layout: "bid_tabulation",
			sample,
			extractor,
			prompt,
			run: runNumber,
			timestamp: new Date().toISOString(),
			durationMs,
			success: true,
			itemCount: object.items.length,
			bidderCount: object.bidders.length,
			data: {
				bidders: object.bidders,
				items: object.items,
				totals: object.totals,
				engineerEstimate: object.engineerEstimate,
			},
		};
	} catch (err) {
		return {
			layout: "bid_tabulation",
			sample,
			extractor,
			prompt,
			run: runNumber,
			timestamp: new Date().toISOString(),
			durationMs: Date.now() - startTime,
			success: false,
			error: err instanceof Error ? err.message : String(err),
			itemCount: 0,
			bidderCount: 0,
			data: { bidders: [], items: [] },
		};
	}
}

function saveResult(result: RunResult) {
	const dir = join(
		EVALS_DIR,
		"results",
		result.sample,
		result.extractor,
		result.prompt,
	);
	mkdirSync(dir, { recursive: true });

	const runFile = `run-${String(result.run).padStart(3, "0")}.json`;
	writeFileSync(join(dir, runFile), JSON.stringify(result, null, 2));
	console.log(`  Saved: results/${result.sample}/${result.extractor}/${result.prompt}/${runFile}`);
}

function getNextRunNumber(sample: string, extractor: string, prompt: string): number {
	const dir = join(EVALS_DIR, "results", sample, extractor, prompt);
	try {
		const files = readdirSync(dir).filter((f) => f.startsWith("run-"));
		return files.length + 1;
	} catch {
		return 1;
	}
}

// -- Main --

async function main() {
	const args = process.argv.slice(2);
	const params: Record<string, string> = {};
	for (const arg of args) {
		const [key, value] = arg.replace("--", "").split("=");
		params[key] = value;
	}

	const sample = params.sample ?? "S01";
	const extractor = params.extractor ?? "E1";
	const prompt = params.prompt ?? "PR1";
	const runs = parseInt(params.runs ?? "1", 10);

	console.log(`\n=== Eval Run: ${sample} × ${extractor} × ${prompt} (${runs} runs) ===\n`);

	for (let i = 0; i < runs; i++) {
		const runNumber = getNextRunNumber(sample, extractor, prompt);
		const result = await runExtraction(sample, extractor, prompt, runNumber);
		saveResult(result);

		if (result.success) {
			console.log(`  ✓ ${result.itemCount} items, ${result.bidderCount} bidders, ${result.durationMs}ms`);
		} else {
			console.log(`  ✗ ${result.error}`);
		}
	}

	process.exit(0);
}

main();
