import { describe, expect, it } from "vitest";
import { compare } from "./compare.js";

const simpleBidTab = (items: any[], bidders: any[] = [], totals?: any) => ({
	bidders,
	contracts: [
		{
			name: "Base Bid",
			bidGroups: [
				{
					type: "base",
					name: "Base Bid",
					sections: [{ name: "", items }],
					totals,
				},
			],
		},
	],
});

const makeItem = (
	itemNo: string,
	bids: Record<string, { unitPrice?: number; extendedPrice?: number }>,
	extra?: { unit?: string; quantity?: number; engineerEstimate?: any },
) => ({
	itemNo,
	description: `Item ${itemNo}`,
	bids,
	...extra,
});

describe("compare", () => {
	it("100% when reference and result are identical", () => {
		const data = simpleBidTab(
			[makeItem("1", { "A": { unitPrice: 100, extendedPrice: 100 } })],
			[{ rank: 1, name: "A", totalBaseBid: 100 }],
		);
		const result = compare(data, data, "test");
		expect(result.itemAccuracy).toBe(100);
		expect(result.fieldAccuracy).toBe(100);
		expect(result.bidderAccuracy).toBe(100);
	});

	it("detects missing item", () => {
		const ref = simpleBidTab(
			[
				makeItem("1", { "A": { extendedPrice: 100 } }),
				makeItem("2", { "A": { extendedPrice: 200 } }),
			],
			[{ rank: 1, name: "A" }],
		);
		const res = simpleBidTab(
			[makeItem("1", { "A": { extendedPrice: 100 } })],
			[{ rank: 1, name: "A" }],
		);
		const result = compare(ref, res, "test");
		expect(result.itemAccuracy).toBe(50);
		expect(result.details.matchedItems).toBe(1);
		expect(result.details.expectedItems).toBe(2);
	});

	it("detects wrong extendedPrice", () => {
		const ref = simpleBidTab(
			[makeItem("1", { "A": { extendedPrice: 50000 } })],
			[{ rank: 1, name: "A" }],
		);
		const res = simpleBidTab(
			[makeItem("1", { "A": { extendedPrice: 30000 } })],
			[{ rank: 1, name: "A" }],
		);
		const result = compare(ref, res, "test");
		expect(result.fieldAccuracy).toBeLessThan(100);
		expect(result.details.errors.some((e: string) => e.includes("ext"))).toBe(true);
	});

	it("detects wrong unitPrice", () => {
		const ref = simpleBidTab(
			[makeItem("1", { "A": { unitPrice: 100, extendedPrice: 100 } })],
			[{ rank: 1, name: "A" }],
		);
		const res = simpleBidTab(
			[makeItem("1", { "A": { unitPrice: 90, extendedPrice: 100 } })],
			[{ rank: 1, name: "A" }],
		);
		const result = compare(ref, res, "test");
		expect(result.details.errors.some((e: string) => e.includes("unit$"))).toBe(true);
	});

	it("detects missing bidder", () => {
		const ref = simpleBidTab(
			[makeItem("1", { "A": { extendedPrice: 100 } })],
			[{ rank: 1, name: "A" }, { rank: 2, name: "B" }],
		);
		const res = simpleBidTab(
			[makeItem("1", { "A": { extendedPrice: 100 } })],
			[{ rank: 1, name: "A" }],
		);
		const result = compare(ref, res, "test");
		expect(result.bidderAccuracy).toBe(50);
	});

	it("detects extra bidder", () => {
		const ref = simpleBidTab(
			[],
			[{ rank: 1, name: "A" }],
		);
		const res = simpleBidTab(
			[],
			[{ rank: 1, name: "A" }, { rank: 2, name: "X" }],
		);
		const result = compare(ref, res, "test");
		expect(result.details.errors.some((e: string) => e.includes("Extra"))).toBe(true);
	});

	it("detects wrong bidder total", () => {
		const ref = simpleBidTab(
			[],
			[{ rank: 1, name: "A", totalBaseBid: 162000 }],
		);
		const res = simpleBidTab(
			[],
			[{ rank: 1, name: "A", totalBaseBid: 150000 }],
		);
		const result = compare(ref, res, "test");
		expect(result.details.errors.some((e: string) => e.includes("Bidder total"))).toBe(true);
	});

	it("checks engineer estimate total", () => {
		const ref = { ...simpleBidTab([]), engineerEstimate: { total: 150000 } };
		const res = { ...simpleBidTab([]), engineerEstimate: { total: 140000 } };
		const result = compare(ref, res, "test");
		expect(result.details.errors.some((e: string) => e.includes("Eng est"))).toBe(true);
	});

	it("checks engineer estimate per item", () => {
		const ref = simpleBidTab([
			makeItem("1", { "A": { extendedPrice: 100 } }, {
				engineerEstimate: { extendedPrice: 90 },
			}),
		]);
		const res = simpleBidTab([
			makeItem("1", { "A": { extendedPrice: 100 } }, {
				engineerEstimate: { extendedPrice: 80 },
			}),
		]);
		const result = compare(ref, res, "test");
		expect(result.details.errors.some((e: string) => e.includes("eng ext"))).toBe(true);
	});

	it("math check: unitPrice × quantity = extendedPrice", () => {
		const ref = simpleBidTab([
			makeItem("1", { "A": { unitPrice: 10, extendedPrice: 1000 } }, { quantity: 100 }),
		]);
		// result has wrong math — $10 × 100 = $1000, not $500
		const res = simpleBidTab([
			makeItem("1", { "A": { unitPrice: 10, extendedPrice: 500 } }, { quantity: 100 }),
		]);
		const result = compare(ref, res, "test");
		expect(result.mathAccuracy).toBe(0);
	});

	it("handles empty contracts gracefully", () => {
		const ref = { bidders: [], contracts: [] };
		const res = { bidders: [], contracts: [] };
		const result = compare(ref, res, "test");
		expect(result.overallScore).toBe(100);
	});

	it("matches items across multiple sections", () => {
		const ref = {
			bidders: [{ rank: 1, name: "A" }],
			contracts: [
				{
					name: "C1",
					bidGroups: [
						{
							type: "base",
							name: "Base",
							sections: [
								{ name: "Sec A", items: [makeItem("1", { "A": { extendedPrice: 100 } })] },
								{ name: "Sec B", items: [makeItem("2", { "A": { extendedPrice: 200 } })] },
							],
						},
					],
				},
			],
		};
		const res = {
			bidders: [{ rank: 1, name: "A" }],
			contracts: [
				{
					name: "C1",
					bidGroups: [
						{
							type: "base",
							name: "Base",
							sections: [
								{
									name: "",
									items: [
										makeItem("1", { "A": { extendedPrice: 100 } }),
										makeItem("2", { "A": { extendedPrice: 200 } }),
									],
								},
							],
						},
					],
				},
			],
		};
		const result = compare(ref, res, "test");
		expect(result.itemAccuracy).toBe(100);
		expect(result.details.matchedItems).toBe(2);
	});
});
