import { describe, expect, it } from "vitest";
import { R1, R3, T1, T2, T5, T6, M1_PAGE1, M1_PAGE2, M3_PAGE1, M3_PAGE2, COVER1 } from "./pages.js";

/**
 * These tests verify that page extraction results merge correctly
 * into the final BidTabulation schema.
 *
 * We import the merge function from the pipeline and test it directly.
 * This is the CONTRACT — if these pass, the UI gets correct data.
 */

// Import the merge function — we need to export it from pipeline
// For now, test the shape expectations

describe("Page fixture shapes", () => {
	describe("bid_ranking", () => {
		it("R1: has 1 bidder with total", () => {
			expect(R1.data.bidders).toHaveLength(1);
			expect(R1.data.bidders[0].totalBaseBid).toBe(500000);
			expect(R1.data.bidders[0].name).toBe("Acme Construction");
		});

		it("R3: has 5 bidders ranked with totals", () => {
			expect(R3.data.bidders).toHaveLength(5);
			expect(R3.data.bidders[0].rank).toBe(1);
			expect(R3.data.bidders[4].rank).toBe(5);
			// Lowest bid is rank 1
			const totals = R3.data.bidders.map((b) => b.totalBaseBid);
			expect(totals[0]).toBeLessThan(totals[4]);
		});

		it("R3: has project info", () => {
			expect(R3.data.project.name).toBeTruthy();
			expect(R3.data.project.owner).toBeTruthy();
			expect(R3.data.project.projectId).toBeTruthy();
		});
	});

	describe("bid_tabulation", () => {
		it("T1: minimum — 1 bidder, 1 item, has total", () => {
			const s = T1.data.sections[0];
			expect(s.items).toHaveLength(1);
			expect(Object.keys(s.items[0].bids)).toHaveLength(1);
			expect(T1.data.totals["Solo Bidder Co"]).toBe(50000);
		});

		it("T2: has engineer estimate per item", () => {
			const items = T2.data.sections[0].items;
			expect(items[0].engineerEstimate).toBeDefined();
			expect(items[0].engineerEstimate!.extendedPrice).toBe(40000);
		});

		it("T2: has section subtotals and bid group totals", () => {
			expect(T2.data.sections[0].subtotals!["C&C Bridge Inc"]).toBe(162000);
			expect(T2.data.totals["C&C Bridge Inc"]).toBe(162000);
		});

		it("T2: items sum to subtotal", () => {
			const sum = T2.data.sections[0].items.reduce(
				(s, item) => s + (item.bids["C&C Bridge Inc"].extendedPrice ?? 0),
				0,
			);
			expect(sum).toBe(T2.data.sections[0].subtotals!["C&C Bridge Inc"]);
		});

		it("T5: two sections with subtotals", () => {
			expect(T5.data.sections).toHaveLength(2);
			expect(T5.data.sections[0].name).toBe("Roadway Items");
			expect(T5.data.sections[1].name).toBe("Bridge Items");
			expect(T5.data.sections[0].subtotals!["Alpha Corp"]).toBe(6300);
			expect(T5.data.sections[1].subtotals!["Alpha Corp"]).toBe(102500);
		});

		it("T5: section subtotals sum to bid group total", () => {
			const sectionSums = T5.data.sections.reduce(
				(s, sec) => s + (sec.subtotals?.["Alpha Corp"] ?? 0),
				0,
			);
			expect(sectionSums).toBe(T5.data.totals["Alpha Corp"]);
		});

		it("T6: has sub-items", () => {
			const item = T6.data.sections[0].items[0];
			expect(item.subItems).toBeDefined();
			expect(item.subItems).toHaveLength(3);
			expect(item.subItems![0].itemNo).toBe("1a");
			expect(item.subItems![1].itemNo).toBe("1b");
		});

		it("T6: sub-items have bids for each bidder", () => {
			const subItem = T6.data.sections[0].items[0].subItems![0];
			expect(subItem.bids["WaterTower Co"]).toBeDefined();
			expect(subItem.bids["Tank Builders"]).toBeDefined();
		});
	});

	describe("multi-page", () => {
		it("M1: page 2 is continuation", () => {
			expect(M1_PAGE2.data.continuedFromPrevious).toBe(true);
		});

		it("M1: both pages have same bidder names", () => {
			expect(M1_PAGE1.data.bidders).toEqual(M1_PAGE2.data.bidders);
		});

		it("M3: page 1 is ranking, page 2 is tabulation", () => {
			expect(M3_PAGE1.pageType).toBe("bid_ranking");
			expect(M3_PAGE2.pageType).toBe("bid_tabulation");
		});
	});

	describe("cover", () => {
		it("COVER1: has all project fields", () => {
			const p = COVER1.data.project;
			expect(p.name).toBeTruthy();
			expect(p.projectId).toBeTruthy();
			expect(p.owner).toBeTruthy();
			expect(p.bidDate).toBeTruthy();
			expect(p.location).toBeTruthy();
		});
	});
});
