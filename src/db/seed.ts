/**
 * Seed the database with initial page types.
 * Run: npx tsx src/db/seed.ts
 */

import "dotenv/config";
import { db, schema, closeDb } from "./index.js";

const INITIAL_PAGE_TYPES = [
	{
		name: "bid_tabulation",
		description:
			"Contains line items with item numbers, descriptions, quantities, unit prices, and/or extended prices. The actual detailed bid data.",
	},
	{
		name: "bid_ranking",
		description:
			'Shows bidder names and their total bid amounts, ranked. NO line items — just names + totals. Sometimes called "bid results" or "bid summary".',
	},
	{
		name: "cover",
		description:
			"Project information page — project name, owner, bid date, location. No bid data.",
	},
	{
		name: "summary",
		description:
			"Totals page, low bidder announcement, or aggregate information.",
	},
	{
		name: "other",
		description:
			"Not related to bid data (blank page, notes, attachments, etc.).",
	},
];

async function seed() {
	console.log("Seeding page types...");

	for (const pt of INITIAL_PAGE_TYPES) {
		await db
			.insert(schema.pageTypes)
			.values(pt)
			.onConflictDoNothing({ target: schema.pageTypes.name });
	}

	const types = await db.select().from(schema.pageTypes);
	console.log(`${types.length} page types in DB:`);
	for (const t of types) {
		console.log(`  ${t.name}: ${t.description}`);
	}

	await closeDb();
}

seed();
