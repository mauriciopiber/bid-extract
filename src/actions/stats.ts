import { z } from "zod/v4";
import { createAction } from "../action.js";
import { db, schema } from "../db/index.js";

export const statsAction = createAction({
	name: "stats",
	description: "Show extraction accuracy stats from DB",
	input: z.object({}),
	handler: async () => {
		const extractions = await db.select().from(schema.extractions);
		const evalResults = await db.select().from(schema.evals);
		const layouts = await db.select().from(schema.layouts);

		const total = extractions.length;
		const clean = extractions.filter(
			(e) => (e.warningCount ?? 0) === 0 && (e.errorCount ?? 0) === 0,
		).length;
		const avgScore =
			evalResults.length > 0
				? Math.round(
						evalResults.reduce((s, e) => s + (e.overallScore ?? 0), 0) /
							evalResults.length,
					)
				: 0;

		return {
			total,
			clean,
			withWarnings: total - clean,
			cleanRate: total > 0 ? Math.round((clean / total) * 100) : 0,
			avgScore,
			layouts: layouts.map((l) => ({
				fingerprint: l.fingerprint,
				name: l.name,
				status: l.status,
				samples: l.sampleCount,
			})),
		};
	},
	formats: {
		cli: (output) => {
			console.log("=== Extraction Stats ===\n");
			console.log(`Total:          ${output.total}`);
			console.log(`Clean:          ${output.clean} (${output.cleanRate}%)`);
			console.log(`With warnings:  ${output.withWarnings}`);
			console.log(`Avg score:      ${output.avgScore}/100`);
			if (output.layouts.length > 0) {
				console.log(`\nLayouts: ${output.layouts.length}`);
				for (const l of output.layouts) {
					console.log(
						`  ${l.fingerprint.padEnd(50)} ${l.status} (${l.samples} samples)`,
					);
				}
			}
		},
	},
});
