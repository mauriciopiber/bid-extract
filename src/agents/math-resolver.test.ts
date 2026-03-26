import { describe, expect, it } from "vitest";
import type { Bidder } from "../schemas/bid-tabulation.js";
import { resolveMath } from "./math-resolver.js";

function makeLegacyData(bidders: Bidder[], engEstimate?: { total: number; lineItems?: { itemNo: string; description: string; quantity?: number; unitPrice?: number; extendedPrice?: number }[] }) {
	return {
		sourceFile: "test.pdf",
		project: { name: "Test Project" },
		bidders,
		engineerEstimate: engEstimate,
		extraction: {
			formatType: "simple-table" as const,
			confidence: 0.95,
			pagesProcessed: 1,
			warnings: [] as string[],
			processingTimeMs: 1000,
		},
	};
}

describe("Math Resolver (reporter mode)", () => {
	it("reports misread unitPrice", () => {
		const data = makeLegacyData([
			{
				rank: 1,
				name: "Bidder A",
				totalBaseBid: 86282.94,
				lineItems: [
					{
						itemNo: "1",
						description: "Three Beam Rail",
						unit: "LF",
						quantity: 315.5,
						unitPrice: 273.46,
						extendedPrice: 86282.94,
					},
				],
			},
		]);

		const result = resolveMath(data);
		// Should report, not fix
		expect(result.corrections.length).toBeGreaterThan(0);
		expect(result.corrections[0]).toContain("273.46");
	});

	it("reports nothing when math is correct", () => {
		const data = makeLegacyData([
			{
				rank: 1,
				name: "Bidder A",
				lineItems: [
					{
						itemNo: "1",
						description: "Mobilization",
						unit: "LS",
						quantity: 1,
						unitPrice: 50000,
						extendedPrice: 50000,
					},
				],
			},
		]);

		const result = resolveMath(data);
		expect(result.corrected).toBe(0);
	});

	it("skips items missing values", () => {
		const data = makeLegacyData([
			{
				rank: 1,
				name: "Bidder A",
				lineItems: [
					{
						itemNo: "1",
						description: "Flat total item",
						unit: "LF",
						quantity: 700,
						extendedPrice: 30000,
					},
				],
			},
		]);

		const result = resolveMath(data);
		expect(result.corrected).toBe(0);
	});
});
