import { describe, expect, it } from "vitest";
import type { BidTabulation } from "../schemas/bid-tabulation.js";
import { resolveMath } from "./math-resolver.js";

function makeBid(overrides: Partial<BidTabulation> = {}): BidTabulation {
	return {
		sourceFile: "test.pdf",
		project: { name: "Test Project" },
		bidders: [],
		extraction: {
			formatType: "simple-table",
			confidence: 0.95,
			pagesProcessed: 1,
			warnings: [],
			processingTimeMs: 1000,
		},
		...overrides,
	};
}

describe("Math Resolver", () => {
	it("fixes misread unitPrice when qty and extended are correct", () => {
		const data = makeBid({
			bidders: [
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
							unitPrice: 273.46, // wrong — should be 273.48
							extendedPrice: 86282.94,
						},
					],
				},
			],
			engineerEstimate: {
				total: 48902.5,
				lineItems: [
					{
						itemNo: "1",
						description: "Three Beam Rail",
						unit: "LF",
						quantity: 315.5, // same qty confirms it
						unitPrice: 155,
						extendedPrice: 48902.5,
					},
				],
			},
		});

		const result = resolveMath(data);
		expect(result.corrected).toBe(1);
		expect(data.bidders[0].lineItems![0].unitPrice).toBe(273.48);
		expect(result.corrections[0]).toContain("273.46");
		expect(result.corrections[0]).toContain("273.48");
	});

	it("does nothing when math is correct", () => {
		const data = makeBid({
			bidders: [
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
			],
		});

		const result = resolveMath(data);
		expect(result.corrected).toBe(0);
	});

	it("handles rounding fix on extendedPrice", () => {
		const data = makeBid({
			bidders: [
				{
					rank: 1,
					name: "Bidder A",
					lineItems: [
						{
							itemNo: "1",
							description: "Excavation",
							unit: "CY",
							quantity: 80.9,
							unitPrice: 879.38,
							extendedPrice: 71141.85, // 879.38 × 80.9 = 71141.842 → rounds to 71141.84
						},
					],
				},
			],
		});

		const result = resolveMath(data);
		expect(result.corrected).toBe(1);
		expect(data.bidders[0].lineItems![0].extendedPrice).toBe(71141.84);
	});

	it("skips items missing values", () => {
		const data = makeBid({
			bidders: [
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
							// no unitPrice — lump sum, don't touch
						},
					],
				},
			],
		});

		const result = resolveMath(data);
		expect(result.corrected).toBe(0);
	});

	it("fixes engineer estimate items too", () => {
		const data = makeBid({
			engineerEstimate: {
				total: 102500,
				lineItems: [
					{
						itemNo: "2",
						description: "Class B Concrete",
						unit: "CY",
						quantity: 82,
						unitPrice: 1250.01, // slightly off
						extendedPrice: 102500,
					},
				],
			},
			bidders: [],
		});

		const result = resolveMath(data);
		expect(result.corrected).toBe(1);
		expect(data.engineerEstimate!.lineItems![0].unitPrice).toBe(1250);
	});
});
