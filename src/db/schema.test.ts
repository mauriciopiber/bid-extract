import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as schema from "./schema.js";

const TEST_DB_URL = process.env.DATABASE_URL;

describe("DB Schema", () => {
	if (!TEST_DB_URL) {
		it.skip("DATABASE_URL not set", () => {});
		return;
	}

	const client = postgres(TEST_DB_URL);
	const db = drizzle(client, { schema });

	afterAll(async () => {
		await client.end();
	});

	it("creates a layout", async () => {
		const [layout] = await db
			.insert(schema.layouts)
			.values({
				fingerprint: `test-${Date.now()}`,
				name: "Test Layout",
				formatType: "simple-table",
				structure: { columnCount: 5, hasUnitPrice: true },
			})
			.returning();

		expect(layout.id).toBeGreaterThan(0);
		expect(layout.status).toBe("discovered");
		expect(layout.sampleCount).toBe(0);

		// Cleanup
		await db.delete(schema.layouts).where(eq(schema.layouts.id, layout.id));
	});

	it("creates a prompt version chain", async () => {
		const [layout] = await db
			.insert(schema.layouts)
			.values({
				fingerprint: `test-chain-${Date.now()}`,
				name: "Chain Test",
				formatType: "engineering-firm",
			})
			.returning();

		const [v1] = await db
			.insert(schema.prompts)
			.values({
				layoutId: layout.id,
				version: 1,
				role: "extractor",
				content: "Extract bid data v1",
				createdBy: "claude-code",
			})
			.returning();

		const [v2] = await db
			.insert(schema.prompts)
			.values({
				layoutId: layout.id,
				version: 2,
				role: "extractor",
				content: "Extract bid data v2 — with lump sum rules",
				parentId: v1.id,
				createdBy: "claude-code",
			})
			.returning();

		expect(v2.parentId).toBe(v1.id);
		expect(v2.version).toBe(2);

		// Cleanup
		await db
			.delete(schema.prompts)
			.where(eq(schema.prompts.layoutId, layout.id));
		await db.delete(schema.layouts).where(eq(schema.layouts.id, layout.id));
	});

	it("creates extraction with run logs", async () => {
		const [layout] = await db
			.insert(schema.layouts)
			.values({
				fingerprint: `test-logs-${Date.now()}`,
				name: "Log Test",
				formatType: "simple-table",
			})
			.returning();

		const [extraction] = await db
			.insert(schema.extractions)
			.values({
				layoutId: layout.id,
				pdfFile: "test.pdf",
				resultJson: { bidders: [] },
				bidderCount: 2,
				lineItemCount: 10,
				warningCount: 1,
				processingTimeMs: 5000,
			})
			.returning();

		// Add step logs
		await db.insert(schema.runLogs).values([
			{
				extractionId: extraction.id,
				step: "classify",
				message: "Classified as simple-table (95%)",
				data: { formatType: "simple-table", confidence: 0.95 },
			},
			{
				extractionId: extraction.id,
				step: "extract",
				message: "Extracted 2 bidders, 10 line items",
				data: { bidderCount: 2, lineItemCount: 10 },
			},
			{
				extractionId: extraction.id,
				step: "math-resolve",
				message: "Fixed 1 value",
				data: { corrected: 1 },
			},
			{
				extractionId: extraction.id,
				step: "validate",
				level: "warn",
				message: "1 warning remaining",
				data: { warnings: ["sum mismatch"] },
			},
		]);

		const logs = await db
			.select()
			.from(schema.runLogs)
			.where(eq(schema.runLogs.extractionId, extraction.id));

		expect(logs).toHaveLength(4);
		expect(logs[0].step).toBe("classify");
		expect(logs[2].step).toBe("math-resolve");

		// Cleanup
		await db
			.delete(schema.runLogs)
			.where(eq(schema.runLogs.extractionId, extraction.id));
		await db
			.delete(schema.extractions)
			.where(eq(schema.extractions.id, extraction.id));
		await db.delete(schema.layouts).where(eq(schema.layouts.id, layout.id));
	});

	it("tracks prompt evolution", async () => {
		const [layout] = await db
			.insert(schema.layouts)
			.values({
				fingerprint: `test-evo-${Date.now()}`,
				name: "Evolution Test",
				formatType: "engineering-firm",
			})
			.returning();

		const [v1] = await db
			.insert(schema.prompts)
			.values({
				layoutId: layout.id,
				version: 1,
				role: "extractor",
				content: "v1 prompt",
				score: 65,
			})
			.returning();

		const [v2] = await db
			.insert(schema.prompts)
			.values({
				layoutId: layout.id,
				version: 2,
				role: "extractor",
				content: "v2 prompt — added lump sum rules",
				parentId: v1.id,
				score: 85,
			})
			.returning();

		const [evo] = await db
			.insert(schema.promptEvolutions)
			.values({
				layoutId: layout.id,
				fromPromptId: v1.id,
				toPromptId: v2.id,
				trigger: "contest",
				errorsAnalyzed: [
					{ field: "unitPrice", issue: "back-calculated from extended/qty" },
				],
				changesMade: ["Added lump sum rules to prompt"],
				reasoning: "Model was fabricating unit prices by dividing",
				scoreBefore: 65,
				scoreAfter: 85,
				accepted: true,
			})
			.returning();

		expect(evo.accepted).toBe(true);
		expect(evo.scoreAfter).toBeGreaterThan(evo.scoreBefore!);

		// Cleanup
		await db
			.delete(schema.promptEvolutions)
			.where(eq(schema.promptEvolutions.id, evo.id));
		await db
			.delete(schema.prompts)
			.where(eq(schema.prompts.layoutId, layout.id));
		await db.delete(schema.layouts).where(eq(schema.layouts.id, layout.id));
	});

	it("creates contest and resolves it", async () => {
		const [extraction] = await db
			.insert(schema.extractions)
			.values({
				pdfFile: "contest-test.pdf",
				resultJson: {
					bidders: [{ name: "Test", lineItems: [{ extendedPrice: 27156 }] }],
				},
			})
			.returning();

		const [contest] = await db
			.insert(schema.contests)
			.values({
				extractionId: extraction.id,
				fieldPath: "bidders.0.lineItems.0.extendedPrice",
				currentValue: 27156,
				suggestedValue: 2715,
				reason: "decimal misread",
			})
			.returning();

		expect(contest.status).toBe("open");

		// Resolve it
		await db
			.update(schema.contests)
			.set({
				status: "resolved",
				resolvedValue: 2715,
				resolution: "LLM confirmed $2,715.00 in document",
				resolvedAt: new Date(),
			})
			.where(eq(schema.contests.id, contest.id));

		const [resolved] = await db
			.select()
			.from(schema.contests)
			.where(eq(schema.contests.id, contest.id));

		expect(resolved.status).toBe("resolved");
		expect(resolved.resolvedValue).toBe(2715);

		// Cleanup
		await db.delete(schema.contests).where(eq(schema.contests.id, contest.id));
		await db
			.delete(schema.extractions)
			.where(eq(schema.extractions.id, extraction.id));
	});
});
