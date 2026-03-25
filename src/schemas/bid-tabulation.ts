/**
 * Universal output schema for bid tabulations.
 *
 * Every PDF — regardless of format — gets normalized to this structure.
 * Fields are optional where not all formats provide the data.
 */

export interface BidTabulation {
	/** Source file */
	sourceFile: string;

	/** Project metadata */
	project: ProjectInfo;

	/** Engineer's estimate, if present */
	engineerEstimate?: EstimateInfo;

	/** All bidders and their bids */
	bidders: Bidder[];

	/** Extraction metadata */
	extraction: ExtractionMeta;
}

export interface ProjectInfo {
	/** Project name / title */
	name: string;
	/** Project number / ID (e.g., "BRO-R042(31)", "6225050025") */
	projectId?: string;
	/** Owner entity (county, city, etc.) */
	owner?: string;
	/** Bid opening date */
	bidDate?: string;
	/** Project location */
	location?: string;
	/** Project description / scope */
	description?: string;
}

export interface EstimateInfo {
	/** Total engineer's estimate */
	total: number;
	/** Line-item breakdown, if available */
	lineItems?: LineItem[];
}

export interface Bidder {
	/** Rank (1 = low bidder / apparent winner) */
	rank: number;
	/** Company name */
	name: string;
	/** Address */
	address?: string;
	/** Phone */
	phone?: string;
	/** Total base bid */
	totalBaseBid?: number;
	/** Total bid including alternates */
	totalBid?: number;
	/** Line-item breakdown */
	lineItems?: LineItem[];
	/** Alternate bids */
	alternates?: AlternateBid[];
}

export interface LineItem {
	/** Item number */
	itemNo: string | number;
	/** Description */
	description: string;
	/** Unit of measure (LS, EA, SY, LF, CY, TON, etc.) */
	unit?: string;
	/** Estimated quantity */
	quantity?: number;
	/** Unit price */
	unitPrice?: number;
	/** Extended / total price */
	extendedPrice?: number;
}

export interface AlternateBid {
	/** Alternate name/number */
	name: string;
	/** Total for this alternate */
	total?: number;
	/** Line items within the alternate */
	lineItems?: LineItem[];
}

export interface ExtractionMeta {
	/** Format classification */
	formatType: FormatType;
	/** Confidence score 0-1 */
	confidence: number;
	/** Number of pages processed */
	pagesProcessed: number;
	/** Validation warnings */
	warnings: string[];
	/** Processing time in ms */
	processingTimeMs: number;
}

export type FormatType =
	| "simple-table" // Clean table, few bidders, few items
	| "multi-bidder-matrix" // Wide table with many bidders across columns
	| "summary-only" // Just bidder names + totals, no line items
	| "engineering-firm" // Formal engineering template with item codes
	| "multi-section" // Base bid + alternates sections
	| "handwritten" // Scanned with handwritten values
	| "submission-list" // Just supplier names + dates, no prices
	| "unknown";
