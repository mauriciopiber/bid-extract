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

	// Show reference summary using BidTabulation schema
	const ref = JSON.parse(readFileSync(refPath, "utf-8"));
	console.log(`\n=== Review: ${sample} ===`);
	console.log(`PDF: ${ref.pdfFile} page ${ref.pageNumber}`);
	console.log(`Status: ${ref.verified ? "✓ VERIFIED" : "⚠ UNVERIFIED"}`);
	console.log(`Project: ${ref.project?.name}`);
	console.log(`Bidders: ${(ref.bidders || []).map((b: any) => `#${b.rank} ${b.name} ($${b.totalBaseBid})`).join(", ")}`);
	if (ref.engineerEstimate) console.log(`Engineer Estimate: $${ref.engineerEstimate.total}`);
	console.log();

	for (const contract of ref.contracts || []) {
		console.log(`CONTRACT: ${contract.name}`);
		for (const group of contract.bidGroups || []) {
			console.log(`  GROUP: ${group.name} (${group.type})`);
			for (const section of group.sections || []) {
				console.log(`    SECTION: ${section.name || "(none)"}`);
				for (const item of section.items || []) {
					const bids = Object.entries(item.bids || {})
						.map(([name, bid]: [string, any]) => {
							const parts = [];
							if (bid.unitPrice != null) parts.push(`u=$${bid.unitPrice}`);
							if (bid.extendedPrice != null) parts.push(`e=$${bid.extendedPrice}`);
							return `${name.slice(0, 15)}: ${parts.join(",")}`;
						})
						.join(" | ");
					const eng = item.engineerEstimate
						? ` ENG: u=$${item.engineerEstimate.unitPrice ?? "?"} e=$${item.engineerEstimate.extendedPrice ?? "?"}`
						: "";
					console.log(`      ${String(item.itemNo).padEnd(4)} ${(item.description || "").slice(0, 40).padEnd(42)} ${(item.unit || "").padEnd(4)} ${String(item.quantity ?? "").padEnd(6)} ${bids}${eng}`);
				}
				if (section.subtotals) console.log(`      SUBTOTALS: ${JSON.stringify(section.subtotals)}`);
			}
			if (group.totals) console.log(`  TOTALS: ${JSON.stringify(group.totals)}`);
		}
	}

	console.log(`\nOpening image + JSON for review...`);
	console.log(`When done, run: npx tsx evals/scripts/verify.ts --sample=${sample}\n`);

	// Open image and JSON
	execSync(`open "${imagePath}"`);
	execSync(`code "${refPath}"`);
}

main();
