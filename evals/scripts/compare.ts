/**
 * Compare run results against reference.
 *
 * Usage:
 *   npx tsx evals/scripts/compare.ts --sample=S01
 *   npx tsx evals/scripts/compare.ts --sample=S01 --extractor=E1 --prompt=PR1
 */

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { compareToReference } from "../lib/compare.js";
import type { PageReference, RunResult } from "../lib/types.js";

const EVALS_DIR = join(import.meta.dirname, "..");

function loadReference(sample: string): PageReference {
	const path = join(EVALS_DIR, "reference", `${sample}.json`);
	return JSON.parse(readFileSync(path, "utf-8"));
}

function loadResults(
	sample: string,
	extractor?: string,
	prompt?: string,
): RunResult[] {
	const results: RunResult[] = [];
	const sampleDir = join(EVALS_DIR, "results", sample);

	try {
		const extractors = extractor
			? [extractor]
			: readdirSync(sampleDir);

		for (const ext of extractors) {
			const extDir = join(sampleDir, ext);
			const prompts = prompt ? [prompt] : readdirSync(extDir);

			for (const pr of prompts) {
				const prDir = join(extDir, pr);
				const files = readdirSync(prDir).filter((f) =>
					f.startsWith("run-"),
				);

				for (const file of files) {
					results.push(JSON.parse(readFileSync(join(prDir, file), "utf-8")));
				}
			}
		}
	} catch {
		// No results yet
	}

	return results;
}

async function main() {
	const args = process.argv.slice(2);
	const params: Record<string, string> = {};
	for (const arg of args) {
		const [key, value] = arg.replace("--", "").split("=");
		params[key] = value;
	}

	const sample = params.sample ?? "S01";

	console.log(`\n=== Comparison: ${sample} ===\n`);

	const reference = loadReference(sample);
	console.log(
		`Reference: ${reference.items.length} items, ${reference.bidders.length} bidders\n`,
	);

	const results = loadResults(sample, params.extractor, params.prompt);

	if (results.length === 0) {
		console.log("No results found. Run some extractions first.");
		process.exit(0);
	}

	console.log(
		`${"Extractor".padEnd(10)} ${"Prompt".padEnd(8)} ${"Run".padEnd(5)} ${"Items".padEnd(8)} ${"Item%".padEnd(7)} ${"Field%".padEnd(8)} ${"Math%".padEnd(7)} ${"Bidder%".padEnd(9)} ${"Total%".padEnd(8)} ${"Overall".padEnd(8)} ${"Status".padEnd(8)}`,
	);
	console.log("-".repeat(90));

	for (const result of results) {
		const comparison = compareToReference(reference, result);
		const status = comparison.overallScore >= 90 ? "✓" : comparison.overallScore >= 70 ? "~" : "✗";

		console.log(
			`${comparison.extractor.padEnd(10)} ${comparison.prompt.padEnd(8)} ${String(comparison.run).padEnd(5)} ${`${comparison.details.matchedItems}/${comparison.details.expectedItems}`.padEnd(8)} ${`${comparison.itemAccuracy}%`.padEnd(7)} ${`${comparison.fieldAccuracy}%`.padEnd(8)} ${`${comparison.mathAccuracy}%`.padEnd(7)} ${`${comparison.bidderAccuracy}%`.padEnd(9)} ${`${comparison.totalAccuracy}%`.padEnd(8)} ${`${comparison.overallScore}%`.padEnd(8)} ${status}`,
		);

		if (comparison.details.fieldErrors.length > 0 && comparison.details.fieldErrors.length <= 5) {
			for (const err of comparison.details.fieldErrors) {
				console.log(`  ⚠ ${err}`);
			}
		} else if (comparison.details.fieldErrors.length > 5) {
			console.log(`  ⚠ ${comparison.details.fieldErrors.length} field errors (showing first 3)`);
			for (const err of comparison.details.fieldErrors.slice(0, 3)) {
				console.log(`    ${err}`);
			}
		}
	}
}

main();
