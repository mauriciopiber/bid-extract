import { z } from "zod/v4";
import { desc, eq } from "drizzle-orm";
import { createAction } from "../action.js";
import { db, schema } from "../db/index.js";

export const listExtractionsAction = createAction({
	name: "extractions",
	description: "List recent extractions from DB",
	input: z.object({
		limit: z.number().default(20),
	}),
	handler: async (input) => {
		const results = await db
			.select()
			.from(schema.extractions)
			.orderBy(desc(schema.extractions.createdAt))
			.limit(input.limit);

		return results.map((e) => ({
			id: e.id,
			file: e.pdfFile,
			bidders: e.bidderCount ?? 0,
			lineItems: e.lineItemCount ?? 0,
			warnings: e.warningCount ?? 0,
			errors: e.errorCount ?? 0,
			timeMs: e.processingTimeMs ?? 0,
			createdAt: e.createdAt,
		}));
	},
	formats: {
		cli: (output) => {
			console.log(`\n=== Recent Extractions (${output.length}) ===\n`);
			for (const e of output) {
				const status = e.warnings === 0 ? "✓" : "⚠";
				console.log(
					`${status} #${e.id} ${e.file.padEnd(50)} ${e.bidders}b ${e.lineItems}li ${e.warnings}w ${e.timeMs}ms`,
				);
			}
		},
	},
});

export const getExtractionAction = createAction({
	name: "get-extraction",
	description: "Get a single extraction with its run logs",
	input: z.object({
		id: z.number(),
	}),
	handler: async (input) => {
		const [extraction] = await db
			.select()
			.from(schema.extractions)
			.where(eq(schema.extractions.id, input.id));

		if (!extraction) throw new Error(`Extraction #${input.id} not found`);

		const logs = await db
			.select()
			.from(schema.runLogs)
			.where(eq(schema.runLogs.extractionId, input.id));

		const evals = await db
			.select()
			.from(schema.evals)
			.where(eq(schema.evals.extractionId, input.id));

		return {
			extraction,
			logs: logs.map((l) => ({
				step: l.step,
				level: l.level,
				message: l.message,
				data: l.data,
			})),
			eval: evals[0] ?? null,
		};
	},
	formats: {
		cli: (output) => {
			const e = output.extraction;
			console.log(`\n=== Extraction #${e.id} — ${e.pdfFile} ===\n`);
			console.log(`Bidders:     ${e.bidderCount}`);
			console.log(`Line items:  ${e.lineItemCount}`);
			console.log(`Warnings:    ${e.warningCount}`);
			console.log(`Time:        ${e.processingTimeMs}ms`);

			if (output.eval) {
				console.log(`\nScores: math=${output.eval.mathScore} completeness=${output.eval.completenessScore} overall=${output.eval.overallScore}`);
			}

			if (output.logs.length > 0) {
				console.log(`\n--- Pipeline Steps ---`);
				for (const log of output.logs) {
					const icon = log.level === "warn" ? "⚠" : log.level === "error" ? "✗" : " ";
					console.log(`${icon} [${log.step}] ${log.message}`);
				}
			}
		},
	},
});
