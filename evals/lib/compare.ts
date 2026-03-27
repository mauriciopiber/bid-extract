/**
 * Compare extraction results against reference (ground truth).
 */

import type {
	PageReference,
	ReferenceItem,
	RunResult,
	ComparisonResult,
} from "./types.js";

export function compareToReference(
	reference: PageReference,
	result: RunResult,
): ComparisonResult {
	const details = {
		expectedItems: reference.items.length,
		extractedItems: result.data.items.length,
		matchedItems: 0,
		fieldErrors: [] as string[],
		mathErrors: [] as string[],
	};

	// Bidder accuracy
	const expectedBidders = new Set(reference.bidders);
	const extractedBidders = new Set(result.data.bidders);
	const bidderMatches = [...expectedBidders].filter((b) =>
		extractedBidders.has(b),
	).length;
	const bidderAccuracy =
		expectedBidders.size > 0
			? Math.round((bidderMatches / expectedBidders.size) * 100)
			: 100;

	if (bidderAccuracy < 100) {
		const missing = [...expectedBidders].filter((b) => !extractedBidders.has(b));
		const extra = [...extractedBidders].filter((b) => !expectedBidders.has(b));
		if (missing.length)
			details.fieldErrors.push(`Missing bidders: ${missing.join(", ")}`);
		if (extra.length)
			details.fieldErrors.push(`Extra bidders: ${extra.join(", ")}`);
	}

	// Item matching — match by itemNo
	let totalFields = 0;
	let correctFields = 0;
	let totalMathChecks = 0;
	let correctMathChecks = 0;

	for (const refItem of reference.items) {
		const extracted = result.data.items.find(
			(e) => String(e.itemNo) === String(refItem.itemNo),
		);

		if (!extracted) {
			details.fieldErrors.push(`Missing item ${refItem.itemNo}`);
			totalFields += 5; // itemNo, desc, unit, qty, bids
			continue;
		}

		details.matchedItems++;

		// Compare fields
		totalFields++;
		if (String(extracted.itemNo) === String(refItem.itemNo)) correctFields++;

		totalFields++;
		if (
			extracted.description &&
			refItem.description &&
			normalized(extracted.description).includes(
				normalized(refItem.description).slice(0, 20),
			)
		) {
			correctFields++;
		} else {
			details.fieldErrors.push(
				`Item ${refItem.itemNo} desc mismatch: "${extracted.description?.slice(0, 30)}" vs "${refItem.description?.slice(0, 30)}"`,
			);
		}

		if (refItem.unit) {
			totalFields++;
			if (normalizeUnit(extracted.unit) === normalizeUnit(refItem.unit)) {
				correctFields++;
			} else {
				details.fieldErrors.push(
					`Item ${refItem.itemNo} unit: "${extracted.unit}" vs "${refItem.unit}"`,
				);
			}
		}

		if (refItem.quantity != null) {
			totalFields++;
			if (extracted.quantity === refItem.quantity) {
				correctFields++;
			} else {
				details.fieldErrors.push(
					`Item ${refItem.itemNo} qty: ${extracted.quantity} vs ${refItem.quantity}`,
				);
			}
		}

		// Compare bids per bidder
		for (const [bidderName, refBid] of Object.entries(refItem.bids)) {
			const extractedBid = extracted.bids?.[bidderName];

			if (!extractedBid) {
				details.fieldErrors.push(
					`Item ${refItem.itemNo}: missing bid for ${bidderName}`,
				);
				totalFields += 2;
				continue;
			}

			if (refBid.extendedPrice != null) {
				totalFields++;
				if (
					extractedBid.extendedPrice != null &&
					Math.abs(extractedBid.extendedPrice - refBid.extendedPrice) < 1
				) {
					correctFields++;
				} else {
					details.fieldErrors.push(
						`Item ${refItem.itemNo} ${bidderName} ext: ${extractedBid.extendedPrice} vs ${refBid.extendedPrice}`,
					);
				}
			}

			if (refBid.unitPrice != null) {
				totalFields++;
				if (
					extractedBid.unitPrice != null &&
					Math.abs(extractedBid.unitPrice - refBid.unitPrice) < 0.01
				) {
					correctFields++;
				} else {
					details.fieldErrors.push(
						`Item ${refItem.itemNo} ${bidderName} unit$: ${extractedBid.unitPrice} vs ${refBid.unitPrice}`,
					);
				}
			}

			// Math check
			if (
				extractedBid.unitPrice != null &&
				extracted.quantity != null &&
				extractedBid.extendedPrice != null
			) {
				totalMathChecks++;
				const expected =
					Math.round(extractedBid.unitPrice * extracted.quantity * 100) / 100;
				if (Math.abs(expected - extractedBid.extendedPrice) <= 1) {
					correctMathChecks++;
				} else {
					details.mathErrors.push(
						`Item ${refItem.itemNo} ${bidderName}: ${extractedBid.unitPrice} × ${extracted.quantity} = ${expected}, got ${extractedBid.extendedPrice}`,
					);
				}
			}
		}
	}

	// Total accuracy
	let totalAccuracy = 100;
	if (reference.totals && result.data.totals) {
		let totalChecks = 0;
		let totalCorrect = 0;
		for (const [bidder, expected] of Object.entries(reference.totals)) {
			totalChecks++;
			const actual = result.data.totals[bidder];
			if (actual != null && Math.abs(actual - expected) < 1) {
				totalCorrect++;
			}
		}
		totalAccuracy =
			totalChecks > 0 ? Math.round((totalCorrect / totalChecks) * 100) : 100;
	}

	const itemAccuracy =
		reference.items.length > 0
			? Math.round((details.matchedItems / reference.items.length) * 100)
			: 100;
	const fieldAccuracy =
		totalFields > 0 ? Math.round((correctFields / totalFields) * 100) : 100;
	const mathAccuracy =
		totalMathChecks > 0
			? Math.round((correctMathChecks / totalMathChecks) * 100)
			: 100;

	const overallScore = Math.round(
		(itemAccuracy * 0.3 +
			fieldAccuracy * 0.3 +
			mathAccuracy * 0.2 +
			bidderAccuracy * 0.1 +
			totalAccuracy * 0.1),
	);

	return {
		sample: result.sample,
		extractor: result.extractor,
		prompt: result.prompt,
		run: result.run,
		itemAccuracy,
		fieldAccuracy,
		mathAccuracy,
		bidderAccuracy,
		totalAccuracy,
		overallScore,
		details,
	};
}

function normalized(s: string): string {
	return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function normalizeUnit(u?: string): string {
	if (!u) return "";
	return u.toUpperCase().replace(/\s+/g, "").trim();
}
