/**
 * DB operations — all reads and writes go through here.
 */

import { eq, and, desc } from "drizzle-orm";
import { db, schema } from "./index.js";
import type { ClassificationResult } from "../agents/classifier.js";
import type { BidTabulation } from "../schemas/bid-tabulation.js";

// -- Layouts --

export async function findOrCreateLayout(
	fingerprint: string,
	name: string,
	formatType: string,
	structure?: Record<string, unknown>,
) {
	const existing = await db
		.select()
		.from(schema.layouts)
		.where(eq(schema.layouts.fingerprint, fingerprint))
		.limit(1);

	if (existing.length > 0) {
		await db
			.update(schema.layouts)
			.set({ sampleCount: existing[0].sampleCount + 1, updatedAt: new Date() })
			.where(eq(schema.layouts.id, existing[0].id));
		return existing[0];
	}

	const [layout] = await db
		.insert(schema.layouts)
		.values({ fingerprint, name, formatType, structure, sampleCount: 1 })
		.returning();

	return layout;
}

export async function updateLayoutStatus(
	layoutId: number,
	status: "discovered" | "extracting" | "validating" | "contesting" | "evolving" | "stable",
) {
	await db
		.update(schema.layouts)
		.set({ status, updatedAt: new Date() })
		.where(eq(schema.layouts.id, layoutId));
}

// -- Prompts --

export async function getActivePrompt(layoutId: number, role: string) {
	const results = await db
		.select()
		.from(schema.prompts)
		.where(
			and(
				eq(schema.prompts.layoutId, layoutId),
				eq(schema.prompts.role, role as "classifier" | "extractor" | "corrector" | "summary"),
			),
		)
		.orderBy(desc(schema.prompts.version))
		.limit(1);

	return results[0] ?? null;
}

export async function createPromptVersion(
	layoutId: number,
	role: string,
	content: string,
	parentId?: number,
	createdBy = "claude-code",
) {
	const current = await getActivePrompt(layoutId, role);
	const version = current ? current.version + 1 : 1;

	const [prompt] = await db
		.insert(schema.prompts)
		.values({
			layoutId,
			version,
			role: role as "classifier" | "extractor" | "corrector" | "summary",
			content,
			parentId: parentId ?? current?.id,
			createdBy,
		})
		.returning();

	return prompt;
}

// -- Extractions --

export async function createExtraction(data: {
	layoutId?: number;
	promptId?: number;
	pdfFile: string;
	resultJson?: unknown;
	bidderCount?: number;
	lineItemCount?: number;
	warningCount?: number;
	errorCount?: number;
	mathCorrections?: number;
	llmCorrections?: number;
	processingTimeMs?: number;
	costUsd?: number;
}) {
	const [extraction] = await db
		.insert(schema.extractions)
		.values({
			layoutId: data.layoutId,
			promptId: data.promptId,
			pdfFile: data.pdfFile,
			resultJson: data.resultJson as Record<string, unknown>,
			bidderCount: data.bidderCount,
			lineItemCount: data.lineItemCount,
			warningCount: data.warningCount,
			errorCount: data.errorCount,
			mathCorrections: data.mathCorrections,
			llmCorrections: data.llmCorrections,
			processingTimeMs: data.processingTimeMs,
			costUsd: data.costUsd,
		})
		.returning();

	return extraction;
}

export async function updateExtraction(
	id: number,
	data: Partial<{
		layoutId: number;
		promptId: number;
		resultJson: unknown;
		bidderCount: number;
		lineItemCount: number;
		warningCount: number;
		errorCount: number;
		mathCorrections: number;
		llmCorrections: number;
		processingTimeMs: number;
		costUsd: number;
	}>,
) {
	await db
		.update(schema.extractions)
		.set(data as Record<string, unknown>)
		.where(eq(schema.extractions.id, id));
}

export async function getExtraction(id: number) {
	const results = await db
		.select()
		.from(schema.extractions)
		.where(eq(schema.extractions.id, id));
	return results[0] ?? null;
}

export async function getExtractionByFile(pdfFile: string) {
	const results = await db
		.select()
		.from(schema.extractions)
		.where(eq(schema.extractions.pdfFile, pdfFile))
		.orderBy(desc(schema.extractions.createdAt))
		.limit(1);
	return results[0] ?? null;
}

// -- Evals --

export async function createEval(data: {
	extractionId: number;
	promptId?: number;
	layoutId?: number;
	mathScore?: number;
	completenessScore?: number;
	accuracyScore?: number;
	overallScore?: number;
	details?: unknown;
}) {
	const [evalResult] = await db
		.insert(schema.evals)
		.values({
			extractionId: data.extractionId,
			promptId: data.promptId,
			layoutId: data.layoutId,
			mathScore: data.mathScore,
			completenessScore: data.completenessScore,
			accuracyScore: data.accuracyScore,
			overallScore: data.overallScore,
			details: data.details as Record<string, unknown>,
		})
		.returning();

	return evalResult;
}

// -- Contests --

export async function createContest(data: {
	extractionId: number;
	fieldPath: string;
	currentValue: unknown;
	suggestedValue?: unknown;
	reason: string;
}) {
	const [contest] = await db
		.insert(schema.contests)
		.values({
			extractionId: data.extractionId,
			fieldPath: data.fieldPath,
			currentValue: data.currentValue,
			suggestedValue: data.suggestedValue,
			reason: data.reason,
		})
		.returning();

	return contest;
}

export async function getOpenContests() {
	return db
		.select()
		.from(schema.contests)
		.where(eq(schema.contests.status, "open"));
}

export async function resolveContestInDb(
	id: number,
	resolvedValue: unknown,
	resolution: string,
) {
	await db
		.update(schema.contests)
		.set({
			status: "resolved",
			resolvedValue,
			resolution,
			resolvedAt: new Date(),
		})
		.where(eq(schema.contests.id, id));
}

// -- Prompt Evolutions --

export async function createEvolution(data: {
	layoutId: number;
	fromPromptId?: number;
	toPromptId?: number;
	trigger: "contest" | "auto" | "claude-code" | "human";
	errorsAnalyzed?: unknown;
	changesMade?: unknown;
	reasoning?: string;
	scoreBefore?: number;
	scoreAfter?: number;
	accepted?: boolean;
}) {
	const [evo] = await db
		.insert(schema.promptEvolutions)
		.values({
			layoutId: data.layoutId,
			fromPromptId: data.fromPromptId,
			toPromptId: data.toPromptId,
			trigger: data.trigger,
			errorsAnalyzed: data.errorsAnalyzed as Record<string, unknown>,
			changesMade: data.changesMade as Record<string, unknown>,
			reasoning: data.reasoning,
			scoreBefore: data.scoreBefore,
			scoreAfter: data.scoreAfter,
			accepted: data.accepted ?? false,
		})
		.returning();

	return evo;
}

// -- Run Logs --

export async function getRunLogs(extractionId: number) {
	return db
		.select()
		.from(schema.runLogs)
		.where(eq(schema.runLogs.extractionId, extractionId));
}
