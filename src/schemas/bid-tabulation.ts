/**
 * Universal output schema for bid tabulations.
 *
 * Hierarchy: Document → Contract(s) → BidGroup(s) → Section(s) → Item(s) → SubItem(s)
 * See docs/bid-glossary.md for definitions.
 */

// -- New hierarchical schema --

export interface BidTabulation {
	sourceFile: string;
	project: ProjectInfo;
	contracts: Contract[];
	bidders: BidderInfo[];
	engineerEstimate?: { total: number };
	extraction: ExtractionMeta;
}

export interface ProjectInfo {
	name: string;
	projectId?: string;
	owner?: string;
	bidDate?: string;
	location?: string;
	description?: string;
	engineer?: string;
}

export interface Contract {
	name: string;
	bidGroups: BidGroup[];
}

export interface BidGroup {
	type: "base" | "supplemental" | "alternate" | "allowance";
	name: string;
	sections: Section[];
	totals?: Record<string, number>;
}

export interface Section {
	name: string;
	items: Item[];
	subtotals?: Record<string, number>;
}

export interface Item {
	itemNo: string | number;
	description: string;
	unit?: string;
	quantity?: number;
	subItems?: Item[];
	bids: Record<string, BidValue>;
	engineerEstimate?: BidValue;
}

export interface BidValue {
	unitPrice?: number;
	extendedPrice?: number;
}

export interface BidderInfo {
	rank: number;
	name: string;
	address?: string;
	phone?: string;
	totalBaseBid?: number;
	totalBid?: number;
}

export interface ExtractionMeta {
	formatType: FormatType;
	confidence: number;
	pagesProcessed: number;
	warnings: string[];
	processingTimeMs: number;
}

export type FormatType =
	| "simple-table"
	| "multi-bidder-matrix"
	| "summary-only"
	| "engineering-firm"
	| "multi-section"
	| "handwritten"
	| "submission-list"
	| "unknown";

// -- Legacy flat types (used by validator, math-resolver) --

export interface LineItem {
	itemNo: string | number;
	description: string;
	section?: string;
	unit?: string;
	quantity?: number;
	unitPrice?: number;
	extendedPrice?: number;
}

export interface Bidder {
	rank: number;
	name: string;
	address?: string;
	phone?: string;
	totalBaseBid?: number;
	totalBid?: number;
	lineItems?: LineItem[];
	alternates?: AlternateBid[];
}

export interface AlternateBid {
	name: string;
	total?: number;
	lineItems?: LineItem[];
}

export interface EstimateInfo {
	total: number;
	lineItems?: LineItem[];
}

/** Flatten hierarchical BidTabulation → legacy Bidder[] for validator */
export function toLegacyBidders(tab: BidTabulation): Bidder[] {
	const bidderMap = new Map<string, Bidder>();
	for (const b of tab.bidders) {
		bidderMap.set(b.name, { ...b, lineItems: [] });
	}
	for (const contract of tab.contracts) {
		for (const group of contract.bidGroups) {
			for (const section of group.sections) {
				flattenItems(section.items, section.name, bidderMap);
			}
		}
	}
	return Array.from(bidderMap.values());
}

/** Flatten hierarchical items → legacy engineer estimate */
export function toLegacyEstimate(
	tab: BidTabulation,
): EstimateInfo | undefined {
	const items: LineItem[] = [];
	for (const contract of tab.contracts) {
		for (const group of contract.bidGroups) {
			for (const section of group.sections) {
				collectEngEstimate(section.items, section.name, items);
			}
		}
	}
	if (items.length === 0 && !tab.engineerEstimate) return undefined;
	return {
		total:
			tab.engineerEstimate?.total ??
			items.reduce((s, i) => s + (i.extendedPrice ?? 0), 0),
		lineItems: items.length > 0 ? items : undefined,
	};
}

function flattenItems(
	items: Item[],
	sectionName: string,
	bidderMap: Map<string, Bidder>,
) {
	for (const item of items) {
		for (const [name, bid] of Object.entries(item.bids)) {
			if (!bidderMap.has(name)) {
				bidderMap.set(name, {
					rank: bidderMap.size + 1,
					name,
					lineItems: [],
				});
			}
			bidderMap.get(name)!.lineItems!.push({
				itemNo: item.itemNo,
				description: item.description,
				section: sectionName,
				unit: item.unit,
				quantity: item.quantity,
				unitPrice: bid.unitPrice,
				extendedPrice: bid.extendedPrice,
			});
		}
		if (item.subItems) {
			flattenItems(item.subItems, sectionName, bidderMap);
		}
	}
}

function collectEngEstimate(
	items: Item[],
	sectionName: string,
	out: LineItem[],
) {
	for (const item of items) {
		if (item.engineerEstimate?.extendedPrice != null) {
			out.push({
				itemNo: item.itemNo,
				description: item.description,
				section: sectionName,
				unit: item.unit,
				quantity: item.quantity,
				unitPrice: item.engineerEstimate.unitPrice,
				extendedPrice: item.engineerEstimate.extendedPrice,
			});
		}
		if (item.subItems) {
			collectEngEstimate(item.subItems, sectionName, out);
		}
	}
}
