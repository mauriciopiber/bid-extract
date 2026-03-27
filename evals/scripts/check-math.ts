/**
 * Check math consistency of a reference file.
 * unitPrice × quantity = extendedPrice for all items.
 *
 * Usage:
 *   npx tsx evals/scripts/check-math.ts --sample=S02
 *   npx tsx evals/scripts/check-math.ts              (checks all)
 */

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { toHierarchical } from "../../src/schemas/convert.js";

const EVALS_DIR = join(import.meta.dirname, "..");

function checkSample(sample: string): number {
	const refPath = join(EVALS_DIR, "reference", `${sample}.json`);
	const raw = JSON.parse(readFileSync(refPath, "utf-8"));
	const data = raw.contracts ? raw : toHierarchical(raw);
	let errors = 0;

	for (const contract of data.contracts || []) {
		for (const group of contract.bidGroups || []) {
			for (const section of group.sections || []) {
				for (const item of section.items || []) {
					// Check each bidder
					for (const [name, bid] of Object.entries(item.bids || {})) {
						const b = bid as { unitPrice?: number; extendedPrice?: number };
						if (b.unitPrice != null && b.extendedPrice != null && item.quantity != null) {
							if (item.isLumpSum) {
								if (Math.abs(b.unitPrice - b.extendedPrice) > 0.01) {
									console.log(`  ✗ ${sample} item ${item.itemNo} ${name}: LUMP SUM unitPrice=${b.unitPrice} ≠ extendedPrice=${b.extendedPrice}`);
									errors++;
								}
							} else {
								const expected = Math.round(b.unitPrice * item.quantity * 100) / 100;
								if (Math.abs(expected - b.extendedPrice) > 1) {
									console.log(`  ✗ ${sample} item ${item.itemNo} ${name}: ${b.unitPrice} × ${item.quantity} = ${expected}, got ${b.extendedPrice}`);
									errors++;
								}
							}
						}
					}

					// Check engineer estimate (same lump sum rules apply)
					const eng = item.engineerEstimate as { unitPrice?: number; extendedPrice?: number } | undefined;
					if (eng?.unitPrice != null && eng?.extendedPrice != null && item.quantity != null) {
						if (item.isLumpSum) {
							if (Math.abs(eng.unitPrice - eng.extendedPrice) > 0.01) {
								console.log(`  ✗ ${sample} item ${item.itemNo} ENG: LUMP SUM unitPrice=${eng.unitPrice} ≠ extendedPrice=${eng.extendedPrice}`);
								errors++;
							}
						} else {
							const expected = Math.round(eng.unitPrice * item.quantity * 100) / 100;
							if (Math.abs(expected - eng.extendedPrice) > 1) {
								console.log(`  ✗ ${sample} item ${item.itemNo} ENG: ${eng.unitPrice} × ${item.quantity} = ${expected}, got ${eng.extendedPrice}`);
								errors++;
							}
						}
					}
				}
			}
		}
	}

	return errors;
}

function main() {
	const args = process.argv.slice(2);
	const params: Record<string, string> = {};
	for (const arg of args) {
		const [key, value] = arg.replace("--", "").split("=");
		params[key] = value;
	}

	const refDir = join(EVALS_DIR, "reference");
	const samples = params.sample
		? [params.sample]
		: readdirSync(refDir)
				.filter((f) => f.endsWith(".json"))
				.map((f) => f.replace(".json", ""));

	let totalErrors = 0;
	for (const sample of samples) {
		const errors = checkSample(sample);
		if (errors === 0) {
			console.log(`  ✓ ${sample}: all math checks pass`);
		}
		totalErrors += errors;
	}

	if (totalErrors === 0) {
		console.log(`\n✓ All samples pass math checks`);
	} else {
		console.log(`\n✗ ${totalErrors} math errors found`);
		process.exit(1);
	}
}

main();
