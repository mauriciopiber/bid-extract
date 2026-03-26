/**
 * Seed the DB with mock extraction data from test fixtures.
 * This lets you see the UI without running any LLM extraction.
 *
 * Run: npx tsx src/db/seed-fixtures.ts
 */

import "dotenv/config";
import { db, schema, closeDb } from "./index.js";
import { R1, R3, T1, T2, T5, T6, M1_PAGE1, M1_PAGE2, COVER1 } from "../test-fixtures/pages.js";
import { mergePageResults } from "../pipeline.js";

async function seed() {
	console.log("Seeding fixture data...\n");

	// Scenario 1: Simple bid ranking (Bollinger style)
	await seedExtraction(
		"Fixture_Bid_Ranking_Simple.pdf",
		[R1],
		"bid_ranking simple",
	);

	// Scenario 2: Full bid ranking with 5 bidders
	await seedExtraction(
		"Fixture_Bid_Ranking_Full.pdf",
		[R3],
		"bid_ranking full",
	);

	// Scenario 3: Simple tabulation — 1 bidder, 1 item
	await seedExtraction(
		"Fixture_Tabulation_Minimal.pdf",
		[T1],
		"tabulation minimal",
	);

	// Scenario 4: Tabulation with engineer estimate
	await seedExtraction(
		"Fixture_Tabulation_With_EngEst.pdf",
		[T2],
		"tabulation with eng est",
	);

	// Scenario 5: Two bidders, two sections
	await seedExtraction(
		"Fixture_Tabulation_Two_Sections.pdf",
		[T5],
		"tabulation two sections",
	);

	// Scenario 6: Sub-items
	await seedExtraction(
		"Fixture_Tabulation_SubItems.pdf",
		[T6],
		"tabulation sub-items",
	);

	// Scenario 7: Multi-page continuation
	await seedExtraction(
		"Fixture_Multi_Page_Continuation.pdf",
		[M1_PAGE1, M1_PAGE2],
		"multi-page continuation",
	);

	// Scenario 8: Cover + Tabulation
	await seedExtraction(
		"Fixture_Cover_Plus_Tabulation.pdf",
		[COVER1, T2],
		"cover + tabulation",
	);

	console.log("\nDone. Check http://localhost:3001");
	await closeDb();
}

async function seedExtraction(
	pdfFile: string,
	pages: { pageNumber: number; pageType: string; data: Record<string, unknown> }[],
	label: string,
) {
	// Merge pages into BidTabulation
	const merged = mergePageResults(pages, pdfFile);

	// Create layout
	const pageTypes = pages.map((p) => p.pageType).join("+");
	const bidderCount = merged.bidders.length;
	const safeName = pdfFile.replace(/[^a-zA-Z0-9]/g, "_");
	const fingerprint = `fixture:${safeName}`;

	const [layout] = await db
		.insert(schema.layouts)
		.values({
			fingerprint,
			name: label,
			formatType: merged.extraction.formatType || "unknown",
			structure: { pageTypes: pages.map((p) => p.pageType) },
			sampleCount: 1,
		})
		.returning();

	// Create extraction
	const [extraction] = await db
		.insert(schema.extractions)
		.values({
			layoutId: layout.id,
			pdfFile,
			resultJson: merged as unknown as Record<string, unknown>,
			bidderCount: merged.bidders.length,
			lineItemCount: merged.contracts.reduce(
				(sum, c) =>
					sum +
					c.bidGroups.reduce(
						(gs, g) =>
							gs + g.sections.reduce((ss, s) => ss + s.items.length, 0),
						0,
					),
				0,
			),
			warningCount: 0,
			errorCount: 0,
			processingTimeMs: 0,
		})
		.returning();

	// Create per-page extractions
	for (const page of pages) {
		await db.insert(schema.pageExtractions).values({
			extractionId: extraction.id,
			pageNumber: page.pageNumber,
			pageType: page.pageType,
			confidence: 0.95,
			resultJson: page.data,
			notes: `Fixture: ${label}`,
		});
	}

	// Create eval
	await db.insert(schema.evals).values({
		extractionId: extraction.id,
		layoutId: layout.id,
		mathScore: 100,
		completenessScore: 100,
		overallScore: 100,
	});

	// Create run logs
	await db.insert(schema.runLogs).values([
		{
			extractionId: extraction.id,
			step: "seed",
			message: `Fixture: ${label}`,
		},
	]);

	console.log(
		`  #${extraction.id} ${label} — ${pages.length} pages, ${merged.bidders.length} bidders`,
	);
}

seed();
