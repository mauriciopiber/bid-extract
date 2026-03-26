import { describe, expect, it } from "vitest";
import { mergePageResults } from "./pipeline.js";
import { R1, R3, T1, T2, T5, T6, M1_PAGE1, M1_PAGE2, M3_PAGE1, M3_PAGE2, COVER1 } from "./test-fixtures/pages.js";

describe("mergePageResults", () => {
	describe("single page", () => {
		it("R1: ranking → bidders with totals, no contracts", () => {
			const result = mergePageResults([R1], "test.pdf");
			expect(result.bidders).toHaveLength(1);
			expect(result.bidders[0].name).toBe("Acme Construction");
			expect(result.bidders[0].totalBaseBid).toBe(500000);
			expect(result.contracts).toHaveLength(0);
		});

		it("R3: ranking → 5 bidders with totals + project info", () => {
			const result = mergePageResults([R3], "test.pdf");
			expect(result.bidders).toHaveLength(5);
			expect(result.bidders[0].rank).toBe(1);
			expect(result.bidders[0].totalBaseBid).toBe(494135);
			expect(result.project.name).toBe("County Road 416 Bridge");
			expect(result.project.owner).toBe("County Commission");
		});

		it("T1: tabulation → 1 contract, 1 bidder, total copied to bidder", () => {
			const result = mergePageResults([T1], "test.pdf");
			expect(result.contracts).toHaveLength(1);
			expect(result.contracts[0].bidGroups).toHaveLength(1);
			expect(result.contracts[0].bidGroups[0].name).toBe("Base Bid");
			expect(result.bidders).toHaveLength(1);
			expect(result.bidders[0].name).toBe("Solo Bidder Co");
			expect(result.bidders[0].totalBaseBid).toBe(50000);
		});

		it("T2: tabulation → engineer estimate computed from items", () => {
			const result = mergePageResults([T2], "test.pdf");
			expect(result.engineerEstimate).toBeDefined();
			expect(result.engineerEstimate!.total).toBe(150000);
		});

		it("T2: tabulation → section name preserved", () => {
			const result = mergePageResults([T2], "test.pdf");
			const section = result.contracts[0].bidGroups[0].sections[0];
			expect(section.name).toBe("Bridge Items");
		});

		it("T5: tabulation → 2 sections, subtotals, bidder totals", () => {
			const result = mergePageResults([T5], "test.pdf");
			const sections = result.contracts[0].bidGroups[0].sections;
			expect(sections).toHaveLength(2);
			expect(sections[0].name).toBe("Roadway Items");
			expect(sections[1].name).toBe("Bridge Items");
			expect(sections[0].subtotals?.["Alpha Corp"]).toBe(6300);
			expect(result.bidders[0].totalBaseBid).toBe(108800);
		});

		it("T6: tabulation → sub-items preserved", () => {
			const result = mergePageResults([T6], "test.pdf");
			const item = result.contracts[0].bidGroups[0].sections[0].items[0];
			expect(item.subItems).toHaveLength(3);
			expect(item.subItems![0].itemNo).toBe("1a");
			expect(item.subItems![0].bids["WaterTower Co"].extendedPrice).toBe(35500);
		});
	});

	describe("multi-page", () => {
		it("M3: ranking + tabulation → bidders from ranking, items from tabulation", () => {
			const result = mergePageResults([M3_PAGE1, M3_PAGE2], "test.pdf");
			// Bidders come from ranking page
			expect(result.bidders.length).toBeGreaterThanOrEqual(2);
			// Items come from tabulation page
			expect(result.contracts).toHaveLength(1);
		});

		it("M1: continuation → items from both pages in same bid group", () => {
			const result = mergePageResults([M1_PAGE1, M1_PAGE2], "test.pdf");
			const sections = result.contracts[0].bidGroups[0].sections;
			// Page 1 has Roadway + Bridge, page 2 has Drainage
			expect(sections.length).toBeGreaterThanOrEqual(3);
			const drainageSection = sections.find((s) => s.name === "Drainage Items");
			expect(drainageSection).toBeDefined();
			expect(drainageSection!.items).toHaveLength(1);
		});

		it("cover + tabulation → project info from cover", () => {
			const result = mergePageResults([COVER1, T2], "test.pdf");
			expect(result.project.name).toBe("County Bridge Replacement");
			expect(result.project.projectId).toBe("BRO-R042(31)");
			expect(result.project.engineer).toBe("Smith & Co Engineers");
		});
	});

	describe("totals flow", () => {
		it("bid group totals → bidder totalBaseBid", () => {
			const result = mergePageResults([T5], "test.pdf");
			const bidderA = result.bidders.find((b) => b.name === "Alpha Corp");
			expect(bidderA?.totalBaseBid).toBe(108800);
		});

		it("engineer estimate computed from per-item data", () => {
			const result = mergePageResults([T2], "test.pdf");
			// Items: 40000 + 30000 + 40000 + 40000 = 150000
			expect(result.engineerEstimate?.total).toBe(150000);
		});

		it("ranking page totals preserved even with tabulation pages", () => {
			const result = mergePageResults([M3_PAGE1, M3_PAGE2], "test.pdf");
			const firstBidder = result.bidders.find((b) => b.name === "Low Bidder Inc");
			expect(firstBidder?.totalBaseBid).toBe(494135);
		});
	});
});
