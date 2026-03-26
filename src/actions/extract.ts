import { z } from "zod/v4";
import { resolve } from "node:path";
import { readdir } from "node:fs/promises";
import { join, basename } from "node:path";
import { createAction } from "../action.js";
import { runPipeline } from "../pipeline.js";

export const extractAction = createAction({
	name: "extract",
	description: "Extract bid data from one or more PDFs. Results go to DB.",
	input: z.object({
		path: z.string().describe("PDF file or directory of PDFs"),
		maxCorrections: z.number().default(2),
	}),
	handler: async (input) => {
		const resolvedPath = resolve(input.path);
		const { statSync } = await import("node:fs");

		let pdfFiles: string[];
		if (statSync(resolvedPath).isDirectory()) {
			const files = await readdir(resolvedPath);
			pdfFiles = files
				.filter((f) => f.toLowerCase().endsWith(".pdf"))
				.map((f) => join(resolvedPath, f));
		} else {
			pdfFiles = [resolvedPath];
		}

		const results: {
			file: string;
			extractionId: number;
			bidders: number;
			lineItems: number;
			corrections: number;
			score: number;
			timeMs: number;
			success: boolean;
			error?: string;
		}[] = [];

		for (const pdfPath of pdfFiles) {
			const name = basename(pdfPath, ".pdf");
			try {
				console.log(`[${results.length + 1}/${pdfFiles.length}] ${name}`);
				const result = await runPipeline(pdfPath, input.maxCorrections);

				const { toLegacyBidders } = await import("../schemas/bid-tabulation.js");
				const legacy = toLegacyBidders(result.data);
				const lineItems = legacy.reduce(
					(sum, b) => sum + (b.lineItems?.length ?? 0),
					0,
				);

				results.push({
					file: basename(pdfPath),
					extractionId: result.extractionId,
					bidders: result.data.bidders.length,
					lineItems,
					corrections: result.corrections,
					score: 0, // filled from eval in pipeline
					timeMs: result.data.extraction.processingTimeMs,
					success: true,
				});
			} catch (err) {
				console.error(`  ✗ ${name}: ${err instanceof Error ? err.message : err}`);
				results.push({
					file: basename(pdfPath),
					extractionId: 0,
					bidders: 0,
					lineItems: 0,
					corrections: 0,
					score: 0,
					timeMs: 0,
					success: false,
					error: err instanceof Error ? err.message : String(err),
				});
			}
		}

		const succeeded = results.filter((r) => r.success).length;
		const failed = results.length - succeeded;

		return { total: results.length, succeeded, failed, results };
	},
	formats: {
		cli: (output) => {
			console.log(`\nDone: ${output.succeeded} succeeded, ${output.failed} failed out of ${output.total}`);
		},
	},
});
