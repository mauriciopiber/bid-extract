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
import { z } from "zod";
import { pdfToImages } from "../../src/utils/pdf-to-images.js";
import type { RunResult } from "../lib/types.js";

const EVALS_DIR = join(import.meta.dirname, "..");

// -- Registries --

const SAMPLES: Record<string, { pdfFile: string; pageNumber: number }> = {
	S01: {
		pdfFile: "Bid_Results_Anderson_Waster_System_Improvements.pdf",
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
};

// -- Schema --

const BidValueSchema = z.object({
	unitPrice: z.number().optional(),
	extendedPrice: z.number().optional(),
});

const ExtractionSchema = z.object({
	bidders: z.array(z.string()),
	bidGroupType: z.string(),
	bidGroupName: z.string(),
	items: z.array(
		z.object({
			itemNo: z.string(),
			description: z.string(),
			sectionName: z.string().optional(),
			unit: z.string().optional(),
			quantity: z.number().optional(),
			bids: z.record(z.string(), BidValueSchema),
			engineerEstimate: BidValueSchema.optional(),
		}),
	),
	totals: z.record(z.string(), z.number()).optional(),
	continuedFromPrevious: z.boolean(),
	continuedOnNext: z.boolean(),
});

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

	const pdfPath = join("/tmp/bid-tabs", sampleConfig.pdfFile);
	const pages = await pdfToImages(pdfPath);
	const pageImage = pages[sampleConfig.pageNumber - 1].image;

	console.log(`  Running ${extractor}/${prompt} on ${sample} (run ${runNumber})...`);
	const startTime = Date.now();

	try {
		const { object } = await generateObject({
			model: anthropic(extractorConfig.model),
			maxTokens: 16384,
			schema: ExtractionSchema,
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
