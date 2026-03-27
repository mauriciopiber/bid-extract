/**
 * Review a sample reference against the PDF image.
 *
 * Opens the PNG image and the reference JSON side by side.
 * After you verify, run: npx tsx evals/scripts/verify.ts --sample=S02
 *
 * Usage:
 *   npx tsx evals/scripts/review.ts --sample=S02
 */

import "dotenv/config";
import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
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
		// List all samples and their status
		const refDir = join(EVALS_DIR, "reference");
		const { readdirSync } = require("node:fs");
		const files = readdirSync(refDir).filter((f: string) => f.endsWith(".json"));

		console.log("\n=== Samples ===\n");
		for (const file of files) {
			const ref = JSON.parse(readFileSync(join(refDir, file), "utf-8"));
			const id = file.replace(".json", "");
			const status = ref.verified ? `✓ verified by ${ref.verifiedBy}` : "⚠ UNVERIFIED";
			const hasImage = existsSync(join(EVALS_DIR, "samples", `${id}.png`));
			console.log(`  ${id}: ${status} ${hasImage ? "" : "(no image — run prepare-samples.ts)"}`);
			console.log(`       ${ref.pdfFile} p${ref.pageNumber} — ${ref.items.length} items`);
		}
		console.log("\nUsage: npx tsx evals/scripts/review.ts --sample=S02");
		return;
	}

	const imagePath = join(EVALS_DIR, "samples", `${sample}.png`);
	const refPath = join(EVALS_DIR, "reference", `${sample}.json`);

	if (!existsSync(imagePath)) {
		console.error(`No image for ${sample}. Run: npx tsx evals/scripts/prepare-samples.ts`);
		process.exit(1);
	}

	if (!existsSync(refPath)) {
		console.error(`No reference for ${sample}. Create evals/reference/${sample}.json first.`);
		process.exit(1);
	}

	// Show reference summary
	const ref = JSON.parse(readFileSync(refPath, "utf-8"));
	console.log(`\n=== Review: ${sample} ===`);
	console.log(`PDF: ${ref.pdfFile} page ${ref.pageNumber}`);
	console.log(`Status: ${ref.verified ? "✓ VERIFIED" : "⚠ UNVERIFIED"}`);
	console.log(`Bidders: ${ref.bidders.join(", ")}`);
	console.log(`Items: ${ref.items.length}`);
	console.log();

	for (const item of ref.items) {
		const bids = Object.entries(item.bids)
			.map(([name, bid]: [string, any]) => {
				const parts = [];
				if (bid.unitPrice != null) parts.push(`unit=$${bid.unitPrice}`);
				if (bid.extendedPrice != null) parts.push(`ext=$${bid.extendedPrice}`);
				return `${name.slice(0, 20)}: ${parts.join(", ")}`;
			})
			.join(" | ");

		console.log(`  ${String(item.itemNo).padEnd(4)} ${item.description.slice(0, 45).padEnd(47)} ${(item.unit || "").padEnd(4)} ${String(item.quantity ?? "").padEnd(8)} ${bids}`);

		if (item.engineerEstimate) {
			const eng = item.engineerEstimate;
			const parts = [];
			if (eng.unitPrice != null) parts.push(`unit=$${eng.unitPrice}`);
			if (eng.extendedPrice != null) parts.push(`ext=$${eng.extendedPrice}`);
			console.log(`       ENG EST: ${parts.join(", ")}`);
		}
	}

	if (ref.totals) {
		console.log(`\n  Totals: ${JSON.stringify(ref.totals)}`);
	}

	console.log(`\nOpening image + JSON for review...`);
	console.log(`When done, run: npx tsx evals/scripts/verify.ts --sample=${sample}\n`);

	// Open image and JSON
	execSync(`open "${imagePath}"`);
	execSync(`code "${refPath}"`);
}

main();
