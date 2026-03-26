/**
 * Math Resolver — REPORTER, not fixer.
 *
 * Reports math mismatches. Does NOT change values.
 * Only human contests should modify extracted data.
 */

import type { Bidder } from "../schemas/bid-tabulation.js";

export interface MathResolution {
	corrected: number;
	corrections: string[];
	totalMatches: boolean;
}

export function resolveMath(data: {
	bidders: Bidder[];
	engineerEstimate?: { total: number; lineItems?: { itemNo: string | number; quantity?: number; unitPrice?: number; extendedPrice?: number }[] };
}): MathResolution {
	const corrections: string[] = [];
	let corrected = 0;

	for (const bidder of data.bidders) {
		if (!bidder.lineItems) continue;

		for (const item of bidder.lineItems) {
			if (
				item.unitPrice != null &&
				item.quantity != null &&
				item.extendedPrice != null
			) {
				const expected =
					Math.round(item.unitPrice * item.quantity * 100) / 100;
				if (Math.abs(expected - item.extendedPrice) > 0.01) {
					corrections.push(
						`${bidder.name} item ${item.itemNo}: ${item.unitPrice} × ${item.quantity} = ${expected}, got ${item.extendedPrice}`,
					);
					corrected++;
				}
			}
		}

		// Total check
		if (bidder.totalBaseBid != null && bidder.lineItems.length > 0) {
			const sum = bidder.lineItems.reduce(
				(acc, item) => acc + (item.extendedPrice ?? 0),
				0,
			);
			const roundedSum = Math.round(sum * 100) / 100;
			if (Math.abs(roundedSum - bidder.totalBaseBid) > 1) {
				corrections.push(
					`${bidder.name}: items sum ${roundedSum} vs total ${bidder.totalBaseBid}`,
				);
			}
		}
	}

	// Engineer estimate
	if (data.engineerEstimate?.lineItems) {
		for (const item of data.engineerEstimate.lineItems) {
			if (
				item.unitPrice != null &&
				item.quantity != null &&
				item.extendedPrice != null
			) {
				const expected =
					Math.round(item.unitPrice * item.quantity * 100) / 100;
				if (Math.abs(expected - item.extendedPrice) > 0.01) {
					corrections.push(
						`Eng. est. item ${item.itemNo}: ${item.unitPrice} × ${item.quantity} = ${expected}, got ${item.extendedPrice}`,
					);
					corrected++;
				}
			}
		}
	}

	let totalMatches = true;
	for (const bidder of data.bidders) {
		if (
			bidder.totalBaseBid != null &&
			bidder.lineItems &&
			bidder.lineItems.length > 0
		) {
			const sum = bidder.lineItems.reduce(
				(acc, item) => acc + (item.extendedPrice ?? 0),
				0,
			);
			if (Math.abs(Math.round(sum * 100) / 100 - bidder.totalBaseBid) > 1) {
				totalMatches = false;
			}
		}
	}

	return { corrected, corrections, totalMatches };
}
