/**
 * Extractor Agent
 *
 * Takes classified page images and extracts structured bid data.
 * Uses the classification to select the right extraction prompt/strategy.
 */

import type { BidTabulation } from "../schemas/bid-tabulation.js";
import type { ClassificationResult } from "./classifier.js";

export async function extractBidData(
	pageImages: Buffer[],
	classification: ClassificationResult,
	sourceFile: string,
): Promise<BidTabulation> {
	// TODO: Implement with Claude vision API
	// Use classification to build format-specific extraction prompt
	// Process all pages and merge results
	throw new Error("Not implemented");
}
