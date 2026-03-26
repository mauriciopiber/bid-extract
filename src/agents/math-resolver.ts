/**
 * Math Resolver Agent
 *
 * Deterministic (no LLM) — fixes extraction errors using math relationships.
 *
 * Trust hierarchy:
 * 1. Quantity — round numbers, matches engineer estimate, rarely misread
 * 2. Extended price — feeds into total, larger/clearer numbers
 * 3. Unit price — small font, lots of decimals, most error-prone
 *
 * Strategy:
 * - If unitPrice × qty ≠ extended → recompute unitPrice from extended / qty
 * - If line items don't sum to total → identify which items are likely wrong
 * - Cross-reference quantities with engineer estimate when available
 */

import type { BidTabulation, LineItem } from "../schemas/bid-tabulation.js";

export interface MathResolution {
	/** Number of line items corrected */
	corrected: number;
	/** Description of each correction */
	corrections: string[];
	/** Whether the total now matches */
	totalMatches: boolean;
}

export function resolveMath(data: BidTabulation): MathResolution {
	const corrections: string[] = [];
	let corrected = 0;

	// Get engineer estimate quantities as ground truth for quantity validation
	const engineerQty = new Map<string | number, number>();
	if (data.engineerEstimate?.lineItems) {
		for (const item of data.engineerEstimate.lineItems) {
			if (item.quantity != null) {
				engineerQty.set(String(item.itemNo), item.quantity);
			}
		}
	}

	for (const bidder of data.bidders) {
		if (!bidder.lineItems) continue;

		for (const item of bidder.lineItems) {
			const fixed = resolveLineItem(item, engineerQty);
			if (fixed) {
				corrections.push(`${bidder.name} item ${item.itemNo}: ${fixed}`);
				corrected++;
			}
		}

		// Check if line items now sum to total
		if (bidder.totalBaseBid != null && bidder.lineItems.length > 0) {
			const sum = bidder.lineItems.reduce(
				(acc, item) => acc + (item.extendedPrice ?? 0),
				0,
			);
			const roundedSum = Math.round(sum * 100) / 100;
			const diff = Math.abs(roundedSum - bidder.totalBaseBid);

			if (diff > 0.01 && diff < bidder.totalBaseBid * 0.001) {
				// Very small discrepancy — likely a rounding issue, accept it
				corrections.push(
					`${bidder.name}: sum ${roundedSum} vs total ${bidder.totalBaseBid} (diff $${diff.toFixed(2)} — rounding)`,
				);
			}
		}
	}

	// Also fix engineer estimate
	if (data.engineerEstimate?.lineItems) {
		for (const item of data.engineerEstimate.lineItems) {
			const fixed = resolveLineItem(item, new Map());
			if (fixed) {
				corrections.push(`Engineer estimate item ${item.itemNo}: ${fixed}`);
				corrected++;
			}
		}
	}

	// Final total check
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
			const roundedSum = Math.round(sum * 100) / 100;
			if (Math.abs(roundedSum - bidder.totalBaseBid) > 1) {
				totalMatches = false;
			}
		}
	}

	return { corrected, corrections, totalMatches };
}

function resolveLineItem(
	item: LineItem,
	engineerQty: Map<string | number, number>,
): string | null {
	const { unitPrice, quantity, extendedPrice } = item;

	// Need at least 2 of 3 values to do anything
	if (unitPrice == null || quantity == null || extendedPrice == null) {
		return null;
	}

	const computed = Math.round(unitPrice * quantity * 100) / 100;
	const diff = Math.abs(computed - extendedPrice);

	// Math checks out — nothing to fix
	if (diff <= 0.01) {
		return null;
	}

	// Verify quantity against engineer estimate
	const engQty = engineerQty.get(String(item.itemNo));
	const quantityTrusted = engQty != null && engQty === quantity;

	// Strategy: trust extended price and quantity, recompute unit price
	// This is almost always the right call because:
	// - Extended prices are larger, more readable numbers
	// - Quantities are usually round numbers or match the engineer estimate
	// - Unit prices have the most decimal digits → most OCR error-prone
	const correctedUnitPrice = Math.round((extendedPrice / quantity) * 100) / 100;

	// Verify the correction makes sense
	const correctedExtended =
		Math.round(correctedUnitPrice * quantity * 100) / 100;
	const correctionDiff = Math.abs(correctedExtended - extendedPrice);

	if (correctionDiff <= 0.01) {
		// Perfect fix — the recomputed unit price produces the exact extended price
		const reason = quantityTrusted
			? "qty verified against engineer estimate"
			: "trusted extended price and qty";
		const msg = `unitPrice ${unitPrice} → ${correctedUnitPrice} (${reason})`;
		item.unitPrice = correctedUnitPrice;
		return msg;
	}

	// If recomputing doesn't give exact match, the extended price might be wrong too
	// In that case, try trusting unitPrice and quantity to recompute extended
	const altExtended = Math.round(unitPrice * quantity * 100) / 100;

	// Check if the original unitPrice × qty is close to extended (within $1)
	if (Math.abs(altExtended - extendedPrice) <= 1) {
		// Close enough — rounding issue, adjust extended
		const msg = `extendedPrice ${extendedPrice} → ${altExtended} (rounding fix)`;
		item.extendedPrice = altExtended;
		return msg;
	}

	// Can't resolve — leave as-is, the corrector LLM will need to handle it
	return null;
}
