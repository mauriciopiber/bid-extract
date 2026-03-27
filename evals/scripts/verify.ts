/**
 * Mark a sample reference as human-verified.
 *
 * Usage:
 *   npx tsx evals/scripts/verify.ts --sample=S02
 *   npx tsx evals/scripts/verify.ts --sample=S02 --by=mauricio
 */

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const EVALS_DIR = join(import.meta.dirname, "..");

function main() {
	const args = process.argv.slice(2);
	const params: Record<string, string> = {};
	for (const arg of args) {
		const [key, value] = arg.replace("--", "").split("=");
		params[key] = value;
	}

	const sample = params.sample;
	if (!sample) {
		console.error("Usage: npx tsx evals/scripts/verify.ts --sample=S02");
		process.exit(1);
	}

	const refPath = join(EVALS_DIR, "reference", `${sample}.json`);
	const ref = JSON.parse(readFileSync(refPath, "utf-8"));

	ref.verified = true;
	ref.verifiedBy = params.by || "human";
	ref.verifiedAt = new Date().toISOString().split("T")[0];

	writeFileSync(refPath, JSON.stringify(ref, null, 2) + "\n");
	console.log(`✓ ${sample} marked as verified by ${ref.verifiedBy} on ${ref.verifiedAt}`);
}

main();
