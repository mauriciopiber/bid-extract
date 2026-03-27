/**
 * Zod schemas — THE single source of truth for all types.
 *
 * TypeScript types are inferred from these with z.infer<>.
 * Used by: generateObject, evals, validation, UI API.
 * NEVER duplicate these schemas anywhere else.
 */

import { z } from "zod";

export const BidValueSchema = z.object({
	unitPrice: z.number().optional(),
	extendedPrice: z.number().optional(),
	noBid: z.boolean().optional(),
});

export const ItemSchema: z.ZodType = z.object({
	itemNo: z.union([z.string(), z.number()]),
	description: z.string(),
	unit: z.string().optional(),
	quantity: z.number().optional(),
	isLumpSum: z.boolean().optional(),
	subItems: z.array(z.lazy(() => ItemSchema)).optional(),
	bids: z.record(z.string(), BidValueSchema),
	engineerEstimate: BidValueSchema.optional(),
});

export const SectionSchema = z.object({
	name: z.string(),
	items: z.array(ItemSchema),
	subtotals: z.record(z.string(), z.number()).optional(),
});

export const BidGroupSchema = z.object({
	type: z.string(),
	name: z.string(),
	sections: z.array(SectionSchema),
	totals: z.record(z.string(), z.number()).optional(),
});

export const ContractSchema = z.object({
	name: z.string(),
	bidGroups: z.array(BidGroupSchema),
});

export const BidderInfoSchema = z.object({
	rank: z.number(),
	name: z.string(),
	address: z.string().optional(),
	phone: z.string().optional(),
	totalBaseBid: z.number().optional(),
	totalBid: z.number().optional(),
});

export const ProjectInfoSchema = z.object({
	name: z.string(),
	projectId: z.string().optional(),
	owner: z.string().optional(),
	bidDate: z.string().optional(),
	location: z.string().optional(),
	description: z.string().optional(),
	engineer: z.string().optional(),
});

/** Schema for generateObject — what the LLM fills.
 *  Flat format that maps 1:1 to the hierarchical BidTabulation.
 *  toHierarchical() converts without losing or computing any data. */
export const PageExtractionSchema = z.object({
	project: ProjectInfoSchema.optional().describe("Project info if visible on this page"),
	bidders: z.array(BidderInfoSchema).describe("ALL bidders — NOT the engineer's estimate"),
	bidGroupType: z.string().describe("base, supplemental, or alternate"),
	bidGroupName: z.string().describe("Name as shown: Base Bid, Alternate 1, etc."),
	items: z.array(
		z.object({
			itemNo: z.string(),
			description: z.string(),
			sectionName: z.string().optional().describe("Section header this item belongs to: Bridge Items, Roadway Items, etc."),
			unit: z.string().optional(),
			quantity: z.number().optional(),
			isLumpSum: z.boolean().optional().describe("True when unitPrice = extendedPrice regardless of quantity"),
			bids: z.record(z.string(), BidValueSchema).describe("Bids keyed by exact bidder name"),
			engineerEstimate: BidValueSchema.optional(),
		}),
	),
	sectionSubtotals: z.record(z.string(), z.record(z.string(), z.number())).optional()
		.describe("Subtotals per section per bidder: {sectionName: {bidderName: amount}}"),
	totals: z.record(z.string(), z.number()).optional()
		.describe("Total bid amount per bidder from the Total row"),
	engineerEstimate: z.object({
		total: z.number().describe("The engineer's estimate total from the Total row"),
	}).optional().describe("Engineer's estimate total from the Total row"),
	continuedFromPrevious: z.boolean(),
	continuedOnNext: z.boolean(),
});

/** Full BidTabulation — the combined document result */
export const BidTabulationSchema = z.object({
	project: ProjectInfoSchema,
	contracts: z.array(ContractSchema),
	bidders: z.array(BidderInfoSchema),
	engineerEstimate: z.object({ total: z.number() }).optional(),
});

// -- Inferred types (use these, not manual interfaces) --

export type ZBidValue = z.infer<typeof BidValueSchema>;
export type ZItem = z.infer<typeof ItemSchema>;
export type ZSection = z.infer<typeof SectionSchema>;
export type ZBidGroup = z.infer<typeof BidGroupSchema>;
export type ZContract = z.infer<typeof ContractSchema>;
export type ZBidderInfo = z.infer<typeof BidderInfoSchema>;
export type ZProjectInfo = z.infer<typeof ProjectInfoSchema>;
export type ZPageExtraction = z.infer<typeof PageExtractionSchema>;
export type ZBidTabulation = z.infer<typeof BidTabulationSchema>;
