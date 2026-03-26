import { z } from "zod/v4";
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { eq } from "drizzle-orm";
import { createAction } from "../action.js";
import { db, schema } from "../db/index.js";

export const dumpAction = createAction({
	name: "dump",
	description: "Dump extraction result from DB to disk (debug only)",
	input: z.object({
		id: z.number(),
		output: z.string().default("./output"),
	}),
	handler: async (input) => {
		const [extraction] = await db
			.select()
			.from(schema.extractions)
			.where(eq(schema.extractions.id, input.id));

		if (!extraction) throw new Error(`Extraction #${input.id} not found`);

		const outDir = resolve(input.output);
		await mkdir(outDir, { recursive: true });
		const outPath = join(
			outDir,
			extraction.pdfFile.replace(".pdf", ".json"),
		);
		await writeFile(outPath, JSON.stringify(extraction.resultJson, null, 2));

		return { path: outPath, file: extraction.pdfFile };
	},
	formats: {
		cli: (output) => {
			console.log(`Dumped to ${output.path}`);
		},
	},
});
