/**
 * Convert between flat (PageExtraction) and hierarchical (BidTabulation) formats.
 * 1:1 mapping — no data lost, no data computed.
 */

import type {
	ZPageExtraction,
	ZBidTabulation,
	ZBidderInfo,
} from "./zod.js";

/** Flat → Hierarchical. Groups items by sectionName. No computation. */
export function toHierarchical(flat: ZPageExtraction): ZBidTabulation {
	// Group items by sectionName
	const sectionMap = new Map<string, ZPageExtraction["items"]>();
	for (const item of flat.items) {
		const name = item.sectionName || "";
		if (!sectionMap.has(name)) sectionMap.set(name, []);
		sectionMap.get(name)!.push(item);
	}

	// Build sections with subtotals
	const sections = Array.from(sectionMap.entries()).map(([name, items]) => ({
		name,
		items: items.map((item) => ({
			itemNo: item.itemNo,
			description: item.description,
			unit: item.unit,
			quantity: item.quantity,
			isLumpSum: item.isLumpSum,
			bids: item.bids,
			engineerEstimate: item.engineerEstimate,
		})),
		subtotals: flat.sectionSubtotals?.[name],
	}));

	return {
		project: flat.project || { name: "" },
		contracts: [
			{
				name: flat.bidGroupName,
				bidGroups: [
					{
						type: flat.bidGroupType,
						name: flat.bidGroupName,
						sections,
						totals: flat.totals,
					},
				],
			},
		],
		bidders: flat.bidders,
		engineerEstimate: flat.engineerEstimate,
	};
}

/** Hierarchical → Flat. Flattens sections into items with sectionName. No computation. */
export function toFlat(hier: ZBidTabulation): ZPageExtraction {
	const items: ZPageExtraction["items"] = [];
	const sectionSubtotals: Record<string, Record<string, number>> = {};

	let bidGroupType = "base";
	let bidGroupName = "Base Bid";
	let totals: Record<string, number> | undefined;

	for (const contract of hier.contracts) {
		for (const group of contract.bidGroups) {
			bidGroupType = group.type;
			bidGroupName = group.name;
			totals = group.totals;

			for (const section of group.sections) {
				if (section.subtotals) {
					sectionSubtotals[section.name] = section.subtotals;
				}

				for (const item of section.items) {
					items.push({
						itemNo: String(item.itemNo),
						description: item.description,
						sectionName: section.name || undefined,
						unit: item.unit,
						quantity: item.quantity,
						isLumpSum: item.isLumpSum,
						bids: item.bids,
						engineerEstimate: item.engineerEstimate,
					});
				}
			}
		}
	}

	return {
		project: hier.project,
		bidders: hier.bidders,
		bidGroupType,
		bidGroupName,
		items,
		sectionSubtotals:
			Object.keys(sectionSubtotals).length > 0 ? sectionSubtotals : undefined,
		totals,
		engineerEstimate: hier.engineerEstimate,
		continuedFromPrevious: false,
		continuedOnNext: false,
	};
}
