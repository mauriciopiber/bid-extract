/**
 * Validator Agent
 *
 * Cross-checks extracted data for consistency.
 * Works on legacy flat Bidder[] format.
 * Reports only — does NOT fix values.
 */

import type { Bidder } from "../schemas/bid-tabulation.js";

export interface ValidationResult {
	valid: boolean;
	errors: ValidationError[];
	warnings: string[];
}

export interface ValidationError {
	field: string;
	message: string;
	expected?: string | number;
	actual?: string | number;
}

export function validateBidTabulation(data: {
	bidders: Bidder[];
	[key: string]: unknown;
}): ValidationResult {
	const errors: ValidationError[] = [];
	const warnings: string[] = [];

	for (const bidder of data.bidders) {
		if (bidder.lineItems && bidder.lineItems.length > 0) {
			for (const item of bidder.lineItems) {
				if (
					item.unitPrice !== undefined &&
					item.quantity !== undefined &&
					item.extendedPrice !== undefined
				) {
					const expected =
						Math.round(item.unitPrice * item.quantity * 100) / 100;
					if (Math.abs(expected - item.extendedPrice) > 0.01) {
						warnings.push(
							`${bidder.name} item ${item.itemNo}: ${item.unitPrice} × ${item.quantity} = ${expected}, got ${item.extendedPrice}`,
						);
					}
				}
			}

			if (bidder.totalBaseBid !== undefined) {
				const sum = bidder.lineItems.reduce(
					(acc, item) => acc + (item.extendedPrice ?? 0),
					0,
				);
				const roundedSum = Math.round(sum * 100) / 100;
				if (Math.abs(roundedSum - bidder.totalBaseBid) > 0.01) {
					warnings.push(
						`${bidder.name}: line items sum ${roundedSum} vs total ${bidder.totalBaseBid}`,
					);
				}
			}
		}
	}

	const ranks = data.bidders.map((b) => b.rank).sort((a, b) => a - b);
	for (let i = 0; i < ranks.length; i++) {
		if (ranks[i] !== i + 1) {
			errors.push({
				field: "bidders.rank",
				message: `Non-sequential ranks: ${ranks.join(", ")}`,
			});
			break;
		}
	}

	return { valid: errors.length === 0, errors, warnings };
}
