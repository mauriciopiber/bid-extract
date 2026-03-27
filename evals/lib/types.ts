/** Reference (ground truth) for a single page */
export interface PageReference {
	layout: string;
	sample: string;
	pdfFile: string;
	pageNumber: number;
	pageType: string;
	bidders: string[];
	engineerEstimateTotal?: number;
	items: ReferenceItem[];
	totals?: Record<string, number>;
}

export interface ReferenceItem {
	itemNo: string;
	description: string;
	sectionName?: string;
	unit?: string;
	quantity?: number;
	bids: Record<string, { unitPrice?: number; extendedPrice?: number }>;
	engineerEstimate?: { unitPrice?: number; extendedPrice?: number };
}

/** Result of a single extraction run */
export interface RunResult {
	layout: string;
	sample: string;
	extractor: string;
	prompt: string;
	run: number;
	timestamp: string;
	durationMs: number;
	success: boolean;
	error?: string;
	itemCount: number;
	bidderCount: number;
	data: {
		bidders: string[];
		items: ReferenceItem[];
		totals?: Record<string, number>;
	};
}

/** Comparison scores */
export interface ComparisonResult {
	sample: string;
	extractor: string;
	prompt: string;
	run: number;
	itemAccuracy: number;
	fieldAccuracy: number;
	mathAccuracy: number;
	bidderAccuracy: number;
	totalAccuracy: number;
	overallScore: number;
	details: {
		expectedItems: number;
		extractedItems: number;
		matchedItems: number;
		fieldErrors: string[];
		mathErrors: string[];
	};
}
