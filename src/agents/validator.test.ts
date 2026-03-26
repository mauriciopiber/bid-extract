import { describe, expect, it } from "vitest";
import type { BidTabulation } from "../schemas/bid-tabulation.js";
import { validateBidTabulation } from "./validator.js";

describe("Validator", () => {
	it("passes clean data", () => {
		const data: BidTabulation = {
			sourceFile: "test.pdf",
			project: { name: "Test" },
			bidders: [
				{
					rank: 1,
					name: "Bidder A",
					totalBaseBid: 150000,
					lineItems: [
						{
							itemNo: "1",
							description: "Item 1",
							unit: "LS",
							quantity: 1,
							unitPrice: 50000,
							extendedPrice: 50000,
						},
						{
							itemNo: "2",
							description: "Item 2",
							unit: "LS",
							quantity: 1,
							unitPrice: 100000,
							extendedPrice: 100000,
						},
					],
				},
			],
			extraction: {
				formatType: "simple-table",
				confidence: 0.95,
				pagesProcessed: 1,
				warnings: [],
				processingTimeMs: 1000,
			},
		};

		const result = validateBidTabulation(data);
		expect(result.valid).toBe(true);
		expect(result.errors).toHaveLength(0);
		expect(result.warnings).toHaveLength(0);
	});

	it("warns on math mismatch", () => {
		const data: BidTabulation = {
			sourceFile: "test.pdf",
			project: { name: "Test" },
			bidders: [
				{
					rank: 1,
					name: "Bidder A",
					lineItems: [
						{
							itemNo: "1",
							description: "Item 1",
							unit: "FT",
							quantity: 100,
							unitPrice: 10,
							extendedPrice: 999,
						},
					],
				},
			],
			extraction: {
				formatType: "simple-table",
				confidence: 0.95,
				pagesProcessed: 1,
				warnings: [],
				processingTimeMs: 1000,
			},
		};

		const result = validateBidTabulation(data);
		expect(result.warnings.length).toBeGreaterThan(0);
		expect(result.warnings[0]).toContain("item 1");
	});

	it("warns on total mismatch", () => {
		const data: BidTabulation = {
			sourceFile: "test.pdf",
			project: { name: "Test" },
			bidders: [
				{
					rank: 1,
					name: "Bidder A",
					totalBaseBid: 999999,
					lineItems: [
						{
							itemNo: "1",
							description: "Item 1",
							unit: "LS",
							quantity: 1,
							unitPrice: 50000,
							extendedPrice: 50000,
						},
					],
				},
			],
			extraction: {
				formatType: "simple-table",
				confidence: 0.95,
				pagesProcessed: 1,
				warnings: [],
				processingTimeMs: 1000,
			},
		};

		const result = validateBidTabulation(data);
		expect(result.warnings.length).toBeGreaterThan(0);
		expect(result.warnings[0]).toContain("line items sum");
	});

	it("errors on non-sequential ranks", () => {
		const data: BidTabulation = {
			sourceFile: "test.pdf",
			project: { name: "Test" },
			bidders: [
				{ rank: 1, name: "A" },
				{ rank: 3, name: "B" },
			],
			extraction: {
				formatType: "simple-table",
				confidence: 0.95,
				pagesProcessed: 1,
				warnings: [],
				processingTimeMs: 1000,
			},
		};

		const result = validateBidTabulation(data);
		expect(result.valid).toBe(false);
		expect(result.errors[0].field).toBe("bidders.rank");
	});
});
