import { describe, expect, it } from "vitest";
import { toHierarchical, toFlat } from "./convert.js";
import type { ZPageExtraction, ZBidTabulation } from "./zod.js";

const sampleFlat: ZPageExtraction = {
	project: { name: "Test Project", owner: "Test Owner" },
	bidders: [
		{ rank: 1, name: "Bidder A", totalBaseBid: 100000 },
		{ rank: 2, name: "Bidder B", totalBaseBid: 120000 },
	],
	bidGroupType: "base",
	bidGroupName: "Base Bid",
	items: [
		{
			itemNo: "1",
			description: "Mobilization",
			sectionName: "Bridge Items",
			unit: "LS",
			quantity: 1,
			isLumpSum: true,
			bids: {
				"Bidder A": { unitPrice: 50000, extendedPrice: 50000 },
				"Bidder B": { unitPrice: 60000, extendedPrice: 60000 },
			},
			engineerEstimate: { unitPrice: 40000, extendedPrice: 40000 },
		},
		{
			itemNo: "2",
			description: "Excavation",
			sectionName: "Bridge Items",
			unit: "CY",
			quantity: 100,
			bids: {
				"Bidder A": { unitPrice: 500, extendedPrice: 50000 },
				"Bidder B": { unitPrice: 600, extendedPrice: 60000 },
			},
			engineerEstimate: { unitPrice: 450, extendedPrice: 45000 },
		},
		{
			itemNo: "3",
			description: "Gravel",
			sectionName: "Roadway Items",
			unit: "TON",
			quantity: 50,
			bids: {
				"Bidder A": { extendedPrice: 5000 },
				"Bidder B": { extendedPrice: 7000 },
			},
		},
	],
	sectionSubtotals: {
		"Bridge Items": { "Bidder A": 100000, "Bidder B": 120000 },
		"Roadway Items": { "Bidder A": 5000, "Bidder B": 7000 },
	},
	totals: { "Bidder A": 100000, "Bidder B": 120000 },
	engineerEstimate: { total: 85000 },
	continuedFromPrevious: false,
	continuedOnNext: false,
};

describe("toHierarchical", () => {
	it("converts flat to hierarchical", () => {
		const hier = toHierarchical(sampleFlat);

		expect(hier.project.name).toBe("Test Project");
		expect(hier.bidders).toHaveLength(2);
		expect(hier.bidders[0].name).toBe("Bidder A");
		expect(hier.bidders[0].totalBaseBid).toBe(100000);
		expect(hier.contracts).toHaveLength(1);
		expect(hier.contracts[0].bidGroups).toHaveLength(1);
		expect(hier.contracts[0].bidGroups[0].type).toBe("base");
		expect(hier.contracts[0].bidGroups[0].name).toBe("Base Bid");
		expect(hier.contracts[0].bidGroups[0].totals).toEqual({ "Bidder A": 100000, "Bidder B": 120000 });
		expect(hier.engineerEstimate?.total).toBe(85000);
	});

	it("groups items by sectionName", () => {
		const hier = toHierarchical(sampleFlat);
		const sections = hier.contracts[0].bidGroups[0].sections;

		expect(sections).toHaveLength(2);
		expect(sections[0].name).toBe("Bridge Items");
		expect(sections[0].items).toHaveLength(2);
		expect(sections[1].name).toBe("Roadway Items");
		expect(sections[1].items).toHaveLength(1);
	});

	it("preserves section subtotals", () => {
		const hier = toHierarchical(sampleFlat);
		const sections = hier.contracts[0].bidGroups[0].sections;

		expect(sections[0].subtotals).toEqual({ "Bidder A": 100000, "Bidder B": 120000 });
		expect(sections[1].subtotals).toEqual({ "Bidder A": 5000, "Bidder B": 7000 });
	});

	it("preserves item fields", () => {
		const hier = toHierarchical(sampleFlat);
		const item = hier.contracts[0].bidGroups[0].sections[0].items[0];

		expect(item.itemNo).toBe("1");
		expect(item.description).toBe("Mobilization");
		expect(item.unit).toBe("LS");
		expect(item.quantity).toBe(1);
		expect(item.isLumpSum).toBe(true);
		expect(item.bids["Bidder A"].unitPrice).toBe(50000);
		expect(item.engineerEstimate?.extendedPrice).toBe(40000);
	});
});

describe("toFlat", () => {
	it("converts hierarchical to flat", () => {
		const hier = toHierarchical(sampleFlat);
		const flat = toFlat(hier);

		expect(flat.bidders).toHaveLength(2);
		expect(flat.bidGroupType).toBe("base");
		expect(flat.bidGroupName).toBe("Base Bid");
		expect(flat.items).toHaveLength(3);
		expect(flat.totals).toEqual({ "Bidder A": 100000, "Bidder B": 120000 });
		expect(flat.engineerEstimate?.total).toBe(85000);
	});

	it("preserves sectionName on items", () => {
		const hier = toHierarchical(sampleFlat);
		const flat = toFlat(hier);

		expect(flat.items[0].sectionName).toBe("Bridge Items");
		expect(flat.items[2].sectionName).toBe("Roadway Items");
	});

	it("preserves sectionSubtotals", () => {
		const hier = toHierarchical(sampleFlat);
		const flat = toFlat(hier);

		expect(flat.sectionSubtotals?.["Bridge Items"]).toEqual({ "Bidder A": 100000, "Bidder B": 120000 });
	});
});

describe("roundtrip", () => {
	it("flat → hierarchical → flat produces same data", () => {
		const hier = toHierarchical(sampleFlat);
		const backToFlat = toFlat(hier);

		expect(backToFlat.bidders).toEqual(sampleFlat.bidders);
		expect(backToFlat.items.length).toBe(sampleFlat.items.length);
		expect(backToFlat.totals).toEqual(sampleFlat.totals);
		expect(backToFlat.engineerEstimate).toEqual(sampleFlat.engineerEstimate);
		expect(backToFlat.sectionSubtotals).toEqual(sampleFlat.sectionSubtotals);
		expect(backToFlat.bidGroupType).toBe(sampleFlat.bidGroupType);
		expect(backToFlat.bidGroupName).toBe(sampleFlat.bidGroupName);

		// Each item matches
		for (let i = 0; i < sampleFlat.items.length; i++) {
			expect(backToFlat.items[i].itemNo).toBe(sampleFlat.items[i].itemNo);
			expect(backToFlat.items[i].description).toBe(sampleFlat.items[i].description);
			expect(backToFlat.items[i].sectionName).toBe(sampleFlat.items[i].sectionName);
			expect(backToFlat.items[i].unit).toBe(sampleFlat.items[i].unit);
			expect(backToFlat.items[i].quantity).toBe(sampleFlat.items[i].quantity);
			expect(backToFlat.items[i].isLumpSum).toBe(sampleFlat.items[i].isLumpSum);
			expect(backToFlat.items[i].bids).toEqual(sampleFlat.items[i].bids);
			expect(backToFlat.items[i].engineerEstimate).toEqual(sampleFlat.items[i].engineerEstimate);
		}
	});
});
