/**
 * Compare extraction result against reference.
 * Both use the BidTabulation schema shape.
 */

export interface ComparisonResult {
	sample: string;
	bidderAccuracy: number;
	itemAccuracy: number;
	fieldAccuracy: number;
	mathAccuracy: number;
	totalAccuracy: number;
	overallScore: number;
	details: {
		expectedBidders: number;
		matchedBidders: number;
		expectedItems: number;
		matchedItems: number;
		totalFields: number;
		correctFields: number;
		errors: string[];
	};
}

interface BidValue {
	unitPrice?: number;
	extendedPrice?: number;
}

interface Item {
	itemNo: string | number;
	description: string;
	unit?: string;
	quantity?: number;
	bids: Record<string, BidValue>;
	engineerEstimate?: BidValue;
	subItems?: Item[];
}

interface Section {
	name: string;
	items: Item[];
	subtotals?: Record<string, number>;
}

interface BidGroup {
	type: string;
	name: string;
	sections: Section[];
	totals?: Record<string, number>;
}

interface BidTabRef {
	bidders: { rank: number; name: string; totalBaseBid?: number }[];
	contracts: { name: string; bidGroups: BidGroup[] }[];
	engineerEstimate?: { total: number };
}

export function compare(
	reference: BidTabRef,
	result: BidTabRef,
	sample: string,
): ComparisonResult {
	const errors: string[] = [];
	let totalFields = 0;
	let correctFields = 0;
	let totalMath = 0;
	let correctMath = 0;

	// -- Bidders --
	const refBidders = new Set(reference.bidders.map((b) => b.name));
	const resBidders = new Set(result.bidders.map((b) => b.name));
	const matchedBidders = [...refBidders].filter((n) => resBidders.has(n)).length;

	for (const name of refBidders) {
		if (!resBidders.has(name)) errors.push(`Missing bidder: ${name}`);
	}
	for (const name of resBidders) {
		if (!refBidders.has(name)) errors.push(`Extra bidder: ${name}`);
	}

	// Bidder totals
	for (const refB of reference.bidders) {
		if (refB.totalBaseBid == null) continue;
		const resB = result.bidders.find((b) => b.name === refB.name);
		totalFields++;
		if (resB?.totalBaseBid != null && Math.abs(resB.totalBaseBid - refB.totalBaseBid) < 1) {
			correctFields++;
		} else {
			errors.push(`Bidder total ${refB.name}: got ${resB?.totalBaseBid}, expected ${refB.totalBaseBid}`);
		}
	}

	// -- Engineer estimate total --
	if (reference.engineerEstimate?.total) {
		totalFields++;
		if (
			result.engineerEstimate?.total &&
			Math.abs(result.engineerEstimate.total - reference.engineerEstimate.total) < 1
		) {
			correctFields++;
		} else {
			errors.push(
				`Eng est total: got ${result.engineerEstimate?.total}, expected ${reference.engineerEstimate.total}`,
			);
		}
	}

	// -- Items --
	const refItems = flattenItems(reference.contracts);
	const resItems = flattenItems(result.contracts);
	let matchedItems = 0;

	for (const refItem of refItems) {
		const resItem = resItems.find(
			(r) => String(r.itemNo) === String(refItem.itemNo),
		);

		if (!resItem) {
			errors.push(`Missing item ${refItem.itemNo}: ${refItem.description.slice(0, 40)}`);
			totalFields += 4;
			continue;
		}

		matchedItems++;

		// Description (fuzzy)
		totalFields++;
		if (
			norm(resItem.description).includes(norm(refItem.description).slice(0, 15))
		) {
			correctFields++;
		}

		// Unit
		if (refItem.unit) {
			totalFields++;
			if (normUnit(resItem.unit) === normUnit(refItem.unit)) {
				correctFields++;
			} else {
				errors.push(`Item ${refItem.itemNo} unit: "${resItem.unit}" vs "${refItem.unit}"`);
			}
		}

		// Quantity
		if (refItem.quantity != null) {
			totalFields++;
			if (resItem.quantity === refItem.quantity) {
				correctFields++;
			} else {
				errors.push(`Item ${refItem.itemNo} qty: ${resItem.quantity} vs ${refItem.quantity}`);
			}
		}

		// Bids per bidder
		for (const [bidder, refBid] of Object.entries(refItem.bids)) {
			const resBid = resItem.bids[bidder];
			if (!resBid) {
				errors.push(`Item ${refItem.itemNo}: no bid for ${bidder}`);
				totalFields += 2;
				continue;
			}

			if (refBid.extendedPrice != null) {
				totalFields++;
				if (resBid.extendedPrice != null && Math.abs(resBid.extendedPrice - refBid.extendedPrice) < 1) {
					correctFields++;
				} else {
					errors.push(`Item ${refItem.itemNo} ${bidder.slice(0, 15)} ext: ${resBid.extendedPrice} vs ${refBid.extendedPrice}`);
				}
			}

			if (refBid.unitPrice != null) {
				totalFields++;
				if (resBid.unitPrice != null && Math.abs(resBid.unitPrice - refBid.unitPrice) < 0.01) {
					correctFields++;
				} else {
					errors.push(`Item ${refItem.itemNo} ${bidder.slice(0, 15)} unit$: ${resBid.unitPrice} vs ${refBid.unitPrice}`);
				}
			}

			// Math check
			if (resBid.unitPrice != null && resItem.quantity != null && resBid.extendedPrice != null) {
				totalMath++;
				const expected = Math.round(resBid.unitPrice * resItem.quantity * 100) / 100;
				if (Math.abs(expected - resBid.extendedPrice) <= 1) {
					correctMath++;
				}
			}
		}

		// Engineer estimate
		if (refItem.engineerEstimate) {
			const resEng = resItem.engineerEstimate;
			if (refItem.engineerEstimate.extendedPrice != null) {
				totalFields++;
				if (resEng?.extendedPrice != null && Math.abs(resEng.extendedPrice - refItem.engineerEstimate.extendedPrice) < 1) {
					correctFields++;
				} else {
					errors.push(`Item ${refItem.itemNo} eng ext: ${resEng?.extendedPrice} vs ${refItem.engineerEstimate.extendedPrice}`);
				}
			}
		}
	}

	const bidderAccuracy = refBidders.size > 0 ? Math.round((matchedBidders / refBidders.size) * 100) : 100;
	const itemAccuracy = refItems.length > 0 ? Math.round((matchedItems / refItems.length) * 100) : 100;
	const fieldAccuracy = totalFields > 0 ? Math.round((correctFields / totalFields) * 100) : 100;
	const mathAccuracy = totalMath > 0 ? Math.round((correctMath / totalMath) * 100) : 100;
	const totalAccuracy = fieldAccuracy; // simplified

	const overallScore = Math.round(
		itemAccuracy * 0.3 + fieldAccuracy * 0.3 + mathAccuracy * 0.2 + bidderAccuracy * 0.1 + totalAccuracy * 0.1,
	);

	return {
		sample,
		bidderAccuracy,
		itemAccuracy,
		fieldAccuracy,
		mathAccuracy,
		totalAccuracy,
		overallScore,
		details: {
			expectedBidders: refBidders.size,
			matchedBidders,
			expectedItems: refItems.length,
			matchedItems,
			totalFields,
			correctFields,
			errors,
		},
	};
}

function flattenItems(contracts: { bidGroups: BidGroup[] }[]): Item[] {
	const items: Item[] = [];
	for (const c of contracts) {
		for (const g of c.bidGroups) {
			for (const s of g.sections) {
				items.push(...s.items);
				for (const item of s.items) {
					if (item.subItems) items.push(...item.subItems);
				}
			}
		}
	}
	return items;
}

function norm(s: string): string {
	return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function normUnit(u?: string): string {
	return (u || "").toUpperCase().replace(/\s+/g, "");
}
