/**
 * Mock page extraction results for testing.
 * Each fixture represents what the LLM would return for a page.
 * Named to match test-matrix.md IDs.
 */

// -- bid_ranking fixtures --

/** R1: Simplest ranking — 1 bidder, total only */
export const R1 = {
	pageNumber: 1,
	pageType: "bid_ranking" as const,
	data: {
		bidders: [{ rank: 1, name: "Acme Construction", totalBaseBid: 500000 }],
		project: { name: "Bridge Replacement" },
	},
};

/** R3: Full ranking — 5 bidders, engineer estimate, addresses, phones */
export const R3 = {
	pageNumber: 1,
	pageType: "bid_ranking" as const,
	data: {
		bidders: [
			{ rank: 1, name: "Low Bidder Inc", totalBaseBid: 494135, address: "123 Main St", phone: "555-0001" },
			{ rank: 2, name: "Second Place LLC", totalBaseBid: 514880.58, address: "456 Oak Ave", phone: "555-0002" },
			{ rank: 3, name: "Third Corp", totalBaseBid: 554205.5, address: "789 Pine Rd" },
			{ rank: 4, name: "Fourth Builders", totalBaseBid: 622825.56 },
			{ rank: 5, name: "Fifth Construction", totalBaseBid: 659568 },
		],
		project: {
			name: "County Road 416 Bridge",
			owner: "County Commission",
			projectId: "9884513",
			bidDate: "10/20/2025",
		},
	},
};

// -- bid_tabulation fixtures --

/** T1: Absolute minimum — 1 bidder, 1 item, no sections */
export const T1 = {
	pageNumber: 1,
	pageType: "bid_tabulation" as const,
	data: {
		bidders: ["Solo Bidder Co"],
		bidGroupType: "base",
		bidGroupName: "Base Bid",
		sections: [
			{
				name: "",
				items: [
					{
						itemNo: "1",
						description: "Mobilization",
						unit: "LS",
						quantity: 1,
						bids: {
							"Solo Bidder Co": { unitPrice: 50000, extendedPrice: 50000 },
						},
					},
				],
			},
		],
		totals: { "Solo Bidder Co": 50000 },
		continuedFromPrevious: false,
		continuedOnNext: false,
	},
};

/** T2: Simple with eng est + total — 1 bidder, 4 items */
export const T2 = {
	pageNumber: 1,
	pageType: "bid_tabulation" as const,
	data: {
		bidders: ["C&C Bridge Inc"],
		bidGroupType: "base",
		bidGroupName: "Base Bid",
		sections: [
			{
				name: "Bridge Items",
				items: [
					{
						itemNo: "1",
						description: "MOBILIZATION",
						unit: "LS",
						quantity: 1,
						bids: { "C&C Bridge Inc": { unitPrice: 50000, extendedPrice: 50000 } },
						engineerEstimate: { unitPrice: 40000, extendedPrice: 40000 },
					},
					{
						itemNo: "2",
						description: "DRIVING H-PILE",
						unit: "FT",
						quantity: 700,
						bids: { "C&C Bridge Inc": { extendedPrice: 30000 } },
						engineerEstimate: { extendedPrice: 30000 },
					},
					{
						itemNo: "3",
						description: "DRIVING SHEET PILE",
						unit: "SF",
						quantity: 2520,
						bids: { "C&C Bridge Inc": { extendedPrice: 40000 } },
						engineerEstimate: { extendedPrice: 40000 },
					},
					{
						itemNo: "4",
						description: "CONSTRUCT CAPS & SET BEAMS",
						unit: "LS",
						quantity: 1,
						bids: { "C&C Bridge Inc": { unitPrice: 42000, extendedPrice: 42000 } },
						engineerEstimate: { unitPrice: 40000, extendedPrice: 40000 },
					},
				],
				subtotals: { "C&C Bridge Inc": 162000 },
			},
		],
		totals: { "C&C Bridge Inc": 162000 },
		continuedFromPrevious: false,
		continuedOnNext: false,
	},
};

/** T5: Two bidders, two sections with subtotals */
export const T5 = {
	pageNumber: 1,
	pageType: "bid_tabulation" as const,
	data: {
		bidders: ["Alpha Corp", "Beta LLC"],
		bidGroupType: "base",
		bidGroupName: "Base Bid",
		sections: [
			{
				name: "Roadway Items",
				items: [
					{
						itemNo: "1",
						description: "Clearing and Grubbing",
						unit: "AC",
						quantity: 0.3,
						bids: {
							"Alpha Corp": { unitPrice: 5000, extendedPrice: 1500 },
							"Beta LLC": { unitPrice: 8000, extendedPrice: 2400 },
						},
						engineerEstimate: { unitPrice: 6000, extendedPrice: 1800 },
					},
					{
						itemNo: "2",
						description: "Embankment",
						unit: "CY",
						quantity: 240,
						bids: {
							"Alpha Corp": { unitPrice: 20, extendedPrice: 4800 },
							"Beta LLC": { unitPrice: 25, extendedPrice: 6000 },
						},
					},
				],
				subtotals: { "Alpha Corp": 6300, "Beta LLC": 8400 },
			},
			{
				name: "Bridge Items",
				items: [
					{
						itemNo: "3",
						description: "Class B Concrete",
						unit: "CY",
						quantity: 82,
						bids: {
							"Alpha Corp": { unitPrice: 1250, extendedPrice: 102500 },
							"Beta LLC": { unitPrice: 1500, extendedPrice: 123000 },
						},
					},
				],
				subtotals: { "Alpha Corp": 102500, "Beta LLC": 123000 },
			},
		],
		totals: { "Alpha Corp": 108800, "Beta LLC": 131400 },
		continuedFromPrevious: false,
		continuedOnNext: false,
	},
};

/** T6: Sub-items — parent item with breakdown */
export const T6 = {
	pageNumber: 1,
	pageType: "bid_tabulation" as const,
	data: {
		bidders: ["WaterTower Co", "Tank Builders"],
		bidGroupType: "base",
		bidGroupName: "Base Bid",
		sections: [
			{
				name: "",
				items: [
					{
						itemNo: "1",
						description: "Furnish and Install Elevated Water Tower",
						unit: "LS",
						quantity: 1,
						bids: {
							"WaterTower Co": { unitPrice: 529300, extendedPrice: 529300 },
							"Tank Builders": { unitPrice: 650000, extendedPrice: 650000 },
						},
						subItems: [
							{
								itemNo: "1a",
								description: "Bonds and Insurance",
								unit: "LS",
								quantity: 1,
								bids: {
									"WaterTower Co": { unitPrice: 35500, extendedPrice: 35500 },
									"Tank Builders": { unitPrice: 50000, extendedPrice: 50000 },
								},
							},
							{
								itemNo: "1b",
								description: "Shop Drawings",
								unit: "LS",
								quantity: 1,
								bids: {
									"WaterTower Co": { unitPrice: 177400, extendedPrice: 177400 },
									"Tank Builders": { unitPrice: 75000, extendedPrice: 75000 },
								},
							},
							{
								itemNo: "1c",
								description: "Steel Fabrication",
								unit: "LS",
								quantity: 1,
								bids: {
									"WaterTower Co": { unitPrice: 215400, extendedPrice: 215400 },
									"Tank Builders": { unitPrice: 420000, extendedPrice: 420000 },
								},
							},
						],
					},
				],
			},
		],
		totals: { "WaterTower Co": 529300, "Tank Builders": 650000 },
		continuedFromPrevious: false,
		continuedOnNext: false,
	},
};

// -- cover fixtures --

export const COVER1 = {
	pageNumber: 1,
	pageType: "cover" as const,
	data: {
		project: {
			name: "County Bridge Replacement",
			projectId: "BRO-R042(31)",
			owner: "County Commission",
			bidDate: "March 27, 2025",
			location: "County Road 416",
			description: "Replace existing bridge",
		},
		engineer: "Smith & Co Engineers",
	},
};

// -- Multi-page fixtures --

/** M3: Ranking page then tabulation page */
export const M3_PAGE1 = R3;
export const M3_PAGE2 = {
	...T5,
	pageNumber: 2,
};

/** M1: Continuation — page 1 starts table, page 2 continues */
export const M1_PAGE1 = T5;
export const M1_PAGE2 = {
	pageNumber: 2,
	pageType: "bid_tabulation" as const,
	data: {
		bidders: ["Alpha Corp", "Beta LLC"],
		bidGroupType: "base",
		bidGroupName: "Base Bid",
		sections: [
			{
				name: "Drainage Items",
				items: [
					{
						itemNo: "4",
						description: "Silt Fence",
						unit: "LF",
						quantity: 225,
						bids: {
							"Alpha Corp": { unitPrice: 7, extendedPrice: 1575 },
							"Beta LLC": { unitPrice: 5, extendedPrice: 1125 },
						},
					},
				],
				subtotals: { "Alpha Corp": 1575, "Beta LLC": 1125 },
			},
		],
		continuedFromPrevious: true,
		continuedOnNext: false,
	},
};
