/**
 * Prepare sample page images from PDFs.
 * Renders each sample page at 600 DPI and saves as PNG.
 *
 * Usage:
 *   npx tsx evals/scripts/prepare-samples.ts
 */

import { mkdirSync, existsSync, readdirSync, renameSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

const EVALS_DIR = join(import.meta.dirname, "..");
const SAMPLES_DIR = join(EVALS_DIR, "samples");
const FILES_DIR = process.env.BID_FILES_DIR || "/Users/mauriciopiber/Projects/edge/bid-extract-files";
const PDF_DIR = join(FILES_DIR, "pdfs");
const DPI = 400;

/** All samples — add new ones here */
const SAMPLES: Record<
	string,
	{ pdfFile: string; pageNumber: number; description: string }
> = {
	S01: {
		pdfFile: "Bid_Results_Anderson_Waster_System_Improvements.pdf",
		pageNumber: 1,
		description: "Anderson Waste p1 — multi-section, 3 bidders, 19+ items",
	},
	S02: {
		pdfFile: "Bid_Results_Andrew_Bridge_2350005.pdf",
		pageNumber: 1,
		description: "Andrew Bridge — simple table, 1 bidder, 4 items, eng est",
	},
	S03: {
		pdfFile: "Bid_Results_Bollinger_Co_Road_416_Bridge.pdf",
		pageNumber: 1,
		description: "Bollinger Co — bid ranking only, 5 bidders, no items",
	},
	S04: {
		pdfFile: "Bid_Results_Eldon_First_Street_Storm_Sewer_Improvements_2025.pdf",
		pageNumber: 1,
		description: "Eldon Storm Sewer — simple table, 2 bidders, 29 items",
	},
	S05: {
		pdfFile: "Bid_Results_Barry_Co_Barry_County_Farm_Rd_2070.pdf",
		pageNumber: 1,
		description: "Barry Co — engineering matrix, 5 bidders, 22 items",
	},
};

function main() {
	mkdirSync(SAMPLES_DIR, { recursive: true });

	console.log(`Preparing samples at ${DPI} DPI\n`);

	for (const [id, sample] of Object.entries(SAMPLES)) {
		const outPath = join(SAMPLES_DIR, `${id}.png`);

		if (existsSync(outPath)) {
			console.log(`  ${id}: already exists — skip`);
			continue;
		}

		const pdfPath = join(PDF_DIR, sample.pdfFile);
		const tempPrefix = join(SAMPLES_DIR, `${id}-temp`);

		try {
			execFileSync("pdftoppm", [
				"-png",
				"-r",
				String(DPI),
				"-f",
				String(sample.pageNumber),
				"-l",
				String(sample.pageNumber),
				pdfPath,
				tempPrefix,
			]);

			// pdftoppm adds a suffix — rename
			const files = readdirSync(SAMPLES_DIR).filter((f) =>
				f.startsWith(`${id}-temp`),
			);
			if (files.length > 0) {
				renameSync(join(SAMPLES_DIR, files[0]), outPath);
			}

			console.log(`  ${id}: ${sample.description}`);
		} catch (err) {
			console.error(
				`  ${id}: FAILED — ${err instanceof Error ? err.message : err}`,
			);
		}
	}

	console.log(`\nDone. Samples in ${SAMPLES_DIR}`);
}

main();
