import { describe, expect, it } from "vitest";
import type {
	BidTabulation,
	Contract,
	BidGroup,
	Section,
	Item,
	BidderInfo,
} from "./bid-tabulation.js";
import { toLegacyBidders, toLegacyEstimate } from "./bid-tabulation.js";

function makeTab(overrides: Partial<BidTabulation> = {}): BidTabulation {
	return {
		sourceFile: "test.pdf",
		project: { name: "Test" },
		contracts: [],
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

function makeItem(
	itemNo: string,
	bids: Record<string, { unitPrice?: number; extendedPrice?: number }>,
	engEst?: { unitPrice?: number; extendedPrice?: number },
): Item {
	return {
		itemNo,
		description: `Item ${itemNo}`,
		unit: "LS",
		quantity: 1,
		bids,
		engineerEstimate: engEst,
	};
}

describe("BidTabulation schema", () => {
	describe("basic structure", () => {
		it("creates empty tabulation", () => {
			const tab = makeTab();
			expect(tab.contracts).toHaveLength(0);
			expect(tab.bidders).toHaveLength(0);
		});

		it("creates tabulation with 1 contract, 1 group, 1 section, 1 item", () => {
			const tab = makeTab({
				contracts: [
					{
						name: "Contract 1",
						bidGroups: [
							{
								type: "base",
								name: "Base Bid",
								sections: [
									{
										name: "Bridge Items",
										items: [
											makeItem("1", { "Bidder A": { unitPrice: 100, extendedPrice: 100 } }),
										],
									},
								],
							},
						],
					},
				],
				bidders: [{ rank: 1, name: "Bidder A", totalBaseBid: 100 }],
			});

			expect(tab.contracts).toHaveLength(1);
			expect(tab.contracts[0].bidGroups).toHaveLength(1);
			expect(tab.contracts[0].bidGroups[0].sections).toHaveLength(1);
			expect(tab.contracts[0].bidGroups[0].sections[0].items).toHaveLength(1);
		});

		it("supports multiple contracts", () => {
			const tab = makeTab({
				contracts: [
					{ name: "Contract 1", bidGroups: [] },
					{ name: "Contract 2", bidGroups: [] },
				],
			});
			expect(tab.contracts).toHaveLength(2);
		});

		it("supports multiple bid groups (base + alternate)", () => {
			const tab = makeTab({
				contracts: [
					{
						name: "Contract 1",
						bidGroups: [
							{ type: "base", name: "Base Bid", sections: [] },
							{ type: "alternate", name: "Alternate 1", sections: [] },
							{ type: "supplemental", name: "Supplemental", sections: [] },
						],
					},
				],
			});
			expect(tab.contracts[0].bidGroups).toHaveLength(3);
			expect(tab.contracts[0].bidGroups[0].type).toBe("base");
			expect(tab.contracts[0].bidGroups[1].type).toBe("alternate");
			expect(tab.contracts[0].bidGroups[2].type).toBe("supplemental");
		});

		it("supports sub-items", () => {
			const item = makeItem("1", { "A": { extendedPrice: 500000 } });
			item.subItems = [
				makeItem("1a", { "A": { extendedPrice: 200000 } }),
				makeItem("1b", { "A": { extendedPrice: 300000 } }),
			];
			expect(item.subItems).toHaveLength(2);
			expect(item.subItems[0].itemNo).toBe("1a");
		});

		it("supports section subtotals", () => {
			const section: Section = {
				name: "Bridge Items",
				items: [
					makeItem("1", { "A": { extendedPrice: 100 }, "B": { extendedPrice: 200 } }),
				],
				subtotals: { "A": 100, "B": 200 },
			};
			expect(section.subtotals?.["A"]).toBe(100);
		});

		it("supports bid group totals", () => {
			const group: BidGroup = {
				type: "base",
				name: "Base Bid",
				sections: [],
				totals: { "A": 500000, "B": 600000 },
			};
			expect(group.totals?.["A"]).toBe(500000);
		});
	});

	describe("toLegacyBidders", () => {
		it("returns empty for empty tabulation", () => {
			const tab = makeTab();
			const bidders = toLegacyBidders(tab);
			expect(bidders).toHaveLength(0);
		});

		it("flattens items to per-bidder lineItems", () => {
			const tab = makeTab({
				contracts: [
					{
						name: "C1",
						bidGroups: [
							{
								type: "base",
								name: "Base Bid",
								sections: [
									{
										name: "Section A",
										items: [
											makeItem("1", {
												"Bidder A": { unitPrice: 100, extendedPrice: 100 },
												"Bidder B": { unitPrice: 120, extendedPrice: 120 },
											}),
											makeItem("2", {
												"Bidder A": { unitPrice: 200, extendedPrice: 200 },
												"Bidder B": { unitPrice: 250, extendedPrice: 250 },
											}),
										],
									},
								],
							},
						],
					},
				],
				bidders: [
					{ rank: 1, name: "Bidder A", totalBaseBid: 300 },
					{ rank: 2, name: "Bidder B", totalBaseBid: 370 },
				],
			});

			const bidders = toLegacyBidders(tab);
			expect(bidders).toHaveLength(2);
			expect(bidders[0].name).toBe("Bidder A");
			expect(bidders[0].lineItems).toHaveLength(2);
			expect(bidders[0].lineItems![0].unitPrice).toBe(100);
			expect(bidders[0].lineItems![1].unitPrice).toBe(200);
			expect(bidders[1].lineItems).toHaveLength(2);
		});

		it("preserves section name on line items", () => {
			const tab = makeTab({
				contracts: [
					{
						name: "C1",
						bidGroups: [
							{
								type: "base",
								name: "Base Bid",
								sections: [
									{
										name: "Bridge Items",
										items: [makeItem("1", { "A": { extendedPrice: 100 } })],
									},
								],
							},
						],
					},
				],
				bidders: [{ rank: 1, name: "A" }],
			});

			const bidders = toLegacyBidders(tab);
			expect(bidders[0].lineItems![0].section).toBe("Bridge Items");
		});

		it("flattens sub-items into lineItems", () => {
			const item = makeItem("1", { "A": { extendedPrice: 500 } });
			item.subItems = [
				makeItem("1a", { "A": { extendedPrice: 200 } }),
				makeItem("1b", { "A": { extendedPrice: 300 } }),
			];

			const tab = makeTab({
				contracts: [
					{
						name: "C1",
						bidGroups: [
							{
								type: "base",
								name: "Base",
								sections: [{ name: "", items: [item] }],
							},
						],
					},
				],
				bidders: [{ rank: 1, name: "A" }],
			});

			const bidders = toLegacyBidders(tab);
			// Parent + 2 sub-items = 3 line items
			expect(bidders[0].lineItems).toHaveLength(3);
		});

		it("preserves bidder totalBaseBid", () => {
			const tab = makeTab({
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
										items: [makeItem("1", { "A": { extendedPrice: 100 } })],
									},
								],
							},
						],
					},
				],
				bidders: [{ rank: 1, name: "A", totalBaseBid: 100 }],
			});

			const bidders = toLegacyBidders(tab);
			expect(bidders[0].totalBaseBid).toBe(100);
		});

		it("handles bidder in bidders[] but no bids in items", () => {
			const tab = makeTab({
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
										items: [makeItem("1", { "Other": { extendedPrice: 100 } })],
									},
								],
							},
						],
					},
				],
				bidders: [
					{ rank: 1, name: "A", totalBaseBid: 500 },
					{ rank: 2, name: "Other", totalBaseBid: 100 },
				],
			});

			const bidders = toLegacyBidders(tab);
			expect(bidders[0].name).toBe("A");
			expect(bidders[0].lineItems).toHaveLength(0);
			expect(bidders[1].name).toBe("Other");
			expect(bidders[1].lineItems).toHaveLength(1);
		});

		it("handles multiple sections across groups", () => {
			const tab = makeTab({
				contracts: [
					{
						name: "C1",
						bidGroups: [
							{
								type: "base",
								name: "Base",
								sections: [
									{ name: "Sec A", items: [makeItem("1", { "X": { extendedPrice: 10 } })] },
									{ name: "Sec B", items: [makeItem("2", { "X": { extendedPrice: 20 } })] },
								],
							},
							{
								type: "alternate",
								name: "Alt 1",
								sections: [
									{ name: "", items: [makeItem("A1", { "X": { extendedPrice: 5 } })] },
								],
							},
						],
					},
				],
				bidders: [{ rank: 1, name: "X" }],
			});

			const bidders = toLegacyBidders(tab);
			expect(bidders[0].lineItems).toHaveLength(3);
			expect(bidders[0].lineItems![0].section).toBe("Sec A");
			expect(bidders[0].lineItems![1].section).toBe("Sec B");
		});
	});

	describe("toLegacyEstimate", () => {
		it("returns undefined for no estimate data", () => {
			const tab = makeTab();
			expect(toLegacyEstimate(tab)).toBeUndefined();
		});

		it("returns total from engineerEstimate field", () => {
			const tab = makeTab({ engineerEstimate: { total: 150000 } });
			const est = toLegacyEstimate(tab);
			expect(est?.total).toBe(150000);
		});

		it("collects per-item engineer estimates", () => {
			const tab = makeTab({
				contracts: [
					{
						name: "C1",
						bidGroups: [
							{
								type: "base",
								name: "Base",
								sections: [
									{
										name: "S1",
										items: [
											makeItem("1", {}, { unitPrice: 100, extendedPrice: 100 }),
											makeItem("2", {}, { unitPrice: 200, extendedPrice: 200 }),
										],
									},
								],
							},
						],
					},
				],
				engineerEstimate: { total: 300 },
			});

			const est = toLegacyEstimate(tab);
			expect(est?.total).toBe(300);
			expect(est?.lineItems).toHaveLength(2);
			expect(est?.lineItems![0].unitPrice).toBe(100);
			expect(est?.lineItems![1].unitPrice).toBe(200);
		});

		it("computes total from items when top-level total missing", () => {
			const tab = makeTab({
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
											makeItem("1", {}, { extendedPrice: 40000 }),
											makeItem("2", {}, { extendedPrice: 30000 }),
										],
									},
								],
							},
						],
					},
				],
			});

			const est = toLegacyEstimate(tab);
			expect(est?.total).toBe(70000);
		});
	});
});
