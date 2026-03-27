/**
 * Compare run results against reference.
 *
 * Usage:
 *   npx tsx evals/scripts/compare.ts --sample=S01
 *   npx tsx evals/scripts/compare.ts --sample=S01 --extractor=E1 --prompt=PR1
 */

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { compare } from "../lib/compare.js";

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

	const refAny = reference as Record<string, unknown>;
	if (!refAny.verified) {
		console.log("⚠ WARNING: Reference is NOT human-verified. Scores are unreliable.\n");
	} else {
		console.log(`✓ Verified by ${refAny.verifiedBy} on ${refAny.verifiedAt}\n`);
	}

	const refItemCount = (reference.contracts || []).reduce(
		(sum: number, c: any) => sum + c.bidGroups.reduce(
			(gs: number, g: any) => gs + g.sections.reduce(
				(ss: number, s: any) => ss + s.items.length, 0), 0), 0);
	console.log(
		`Reference: ${refItemCount} items, ${reference.bidders.length} bidders\n`,
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
		// Convert flat run result to BidTabRef shape for comparison
		const resultAsBidTab = {
			bidders: (result.data.bidders || []).map((name: string, i: number) => ({
				rank: i + 1,
				name,
			})),
			contracts: result.data.items
				? [
						{
							name: "Base Bid",
							bidGroups: [
								{
									type: "base",
									name: "Base Bid",
									sections: [
										{
											name: "",
											items: result.data.items,
										},
									],
									totals: result.data.totals,
								},
							],
						},
					]
				: [],
		};
		const comparison = compare(reference, resultAsBidTab, sample);
		const status = comparison.overallScore >= 90 ? "✓" : comparison.overallScore >= 70 ? "~" : "✗";

		console.log(
			`${(result.extractor || "?").padEnd(10)} ${(result.prompt || "?").padEnd(8)} ${String(result.run || "?").padEnd(5)} ${`${comparison.details.matchedItems}/${comparison.details.expectedItems}`.padEnd(8)} ${`${comparison.itemAccuracy}%`.padEnd(7)} ${`${comparison.fieldAccuracy}%`.padEnd(8)} ${`${comparison.mathAccuracy}%`.padEnd(7)} ${`${comparison.bidderAccuracy}%`.padEnd(9)} ${`${comparison.totalAccuracy}%`.padEnd(8)} ${`${comparison.overallScore}%`.padEnd(8)} ${status}`,
		);

		if (comparison.details.errors.length > 0 && comparison.details.errors.length <= 5) {
			for (const err of comparison.details.errors) {
				console.log(`  ⚠ ${err}`);
			}
		} else if (comparison.details.errors.length > 5) {
			console.log(`  ⚠ ${comparison.details.errors.length} field errors (showing first 3)`);
			for (const err of comparison.details.errors.slice(0, 3)) {
				console.log(`    ${err}`);
			}
		}
	}
}

main();
