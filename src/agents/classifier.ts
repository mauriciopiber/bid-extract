/**
 * Classifier Agent
 *
 * Takes a PDF (as page images) and determines:
 * - Format type (simple table, multi-bidder matrix, handwritten, etc.)
 * - Number of bidders
 * - Whether line items are present
 * - Whether alternates exist
 * - Whether handwriting is present
 * - Recommended extraction strategy
 */

import type { FormatType } from "../schemas/bid-tabulation.js";

export interface ClassificationResult {
	formatType: FormatType;
	confidence: number;
	bidderCount: number;
	hasLineItems: boolean;
	hasAlternates: boolean;
	hasHandwriting: boolean;
	hasEngineerEstimate: boolean;
	pageCount: number;
	notes: string;
}

export async function classifyDocument(
	pageImages: Buffer[],
): Promise<ClassificationResult> {
	// TODO: Implement with Claude vision API
	// Send page 1 (and optionally page 2) as images
	// Ask Claude to classify the format
	throw new Error("Not implemented");
}
