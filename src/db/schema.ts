import {
	boolean,
	integer,
	jsonb,
	pgEnum,
	pgTable,
	real,
	serial,
	text,
	timestamp,
} from "drizzle-orm/pg-core";

// -- Enums --

export const layoutStatusEnum = pgEnum("layout_status", [
	"discovered",
	"extracting",
	"validating",
	"contesting",
	"evolving",
	"stable",
]);

export const promptRoleEnum = pgEnum("prompt_role", [
	"classifier",
	"extractor",
	"corrector",
	"summary",
]);

export const contestStatusEnum = pgEnum("contest_status", [
	"open",
	"resolving",
	"resolved",
	"unresolvable",
]);

export const evolutionTriggerEnum = pgEnum("evolution_trigger", [
	"contest",
	"auto",
	"claude-code",
	"human",
]);

// -- Tables --

/** Known page types — grows as we discover new ones */
export const pageTypes = pgTable("page_types", {
	id: serial().primaryKey(),
	name: text().notNull().unique(),
	description: text().notNull(),
	/** Example: what does this page type look like? */
	examples: text(),
	createdAt: timestamp("created_at").notNull().defaultNow(),
});


/** A unique document layout / structure fingerprint */
export const layouts = pgTable("layouts", {
	id: serial().primaryKey(),
	/** Structural fingerprint code */
	fingerprint: text().notNull().unique(),
	/** Human-readable name */
	name: text().notNull(),
	/** Format type classification */
	formatType: text("format_type").notNull(),
	/** Structural metadata: columns, headers, sections, etc. */
	structure: jsonb().$type<{
		columnCount?: number;
		columnHeaders?: string[];
		sections?: string[];
		hasUnitPrice?: boolean;
		hasEngineerEstimate?: boolean;
		pageCount?: number;
	}>(),
	status: layoutStatusEnum().notNull().default("discovered"),
	sampleCount: integer("sample_count").notNull().default(0),
	activePromptId: integer("active_prompt_id"),
	createdAt: timestamp("created_at").notNull().defaultNow(),
	updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

/** Versioned prompts — each layout has a chain of prompt versions */
export const prompts = pgTable("prompts", {
	id: serial().primaryKey(),
	layoutId: integer("layout_id").references(() => layouts.id),
	version: integer().notNull(),
	role: promptRoleEnum().notNull(),
	content: text().notNull(),
	/** Previous version this evolved from */
	parentId: integer("parent_id"),
	/** Latest eval score (0-100) */
	score: real(),
	createdBy: text("created_by").notNull().default("claude-code"),
	createdAt: timestamp("created_at").notNull().defaultNow(),
});

/** Each PDF extraction run */
export const extractions = pgTable("extractions", {
	id: serial().primaryKey(),
	layoutId: integer("layout_id").references(() => layouts.id),
	promptId: integer("prompt_id").references(() => prompts.id),
	pdfFile: text("pdf_file").notNull(),
	resultJson: jsonb("result_json"),
	bidderCount: integer("bidder_count"),
	lineItemCount: integer("line_item_count"),
	warningCount: integer("warning_count").default(0),
	errorCount: integer("error_count").default(0),
	mathCorrections: integer("math_corrections").default(0),
	llmCorrections: integer("llm_corrections").default(0),
	processingTimeMs: integer("processing_time_ms"),
	costUsd: real("cost_usd"),
	createdAt: timestamp("created_at").notNull().defaultNow(),
});

/** Eval scores per extraction */
export const evals = pgTable("evals", {
	id: serial().primaryKey(),
	extractionId: integer("extraction_id")
		.references(() => extractions.id)
		.notNull(),
	promptId: integer("prompt_id").references(() => prompts.id),
	layoutId: integer("layout_id").references(() => layouts.id),
	mathScore: real("math_score"),
	completenessScore: real("completeness_score"),
	accuracyScore: real("accuracy_score"),
	overallScore: real("overall_score"),
	details: jsonb(),
	createdAt: timestamp("created_at").notNull().defaultNow(),
});

/** Ground truth test cases built from resolved contests */
export const testCases = pgTable("test_cases", {
	id: serial().primaryKey(),
	layoutId: integer("layout_id").references(() => layouts.id),
	pdfFile: text("pdf_file").notNull(),
	expectedJson: jsonb("expected_json").notNull(),
	createdFrom: text("created_from").notNull().default("manual"),
	createdAt: timestamp("created_at").notNull().defaultNow(),
});

/** Human-flagged values that need re-examination */
export const contests = pgTable("contests", {
	id: serial().primaryKey(),
	extractionId: integer("extraction_id").references(() => extractions.id),
	fieldPath: text("field_path").notNull(),
	currentValue: jsonb("current_value"),
	suggestedValue: jsonb("suggested_value"),
	reason: text().notNull(),
	status: contestStatusEnum().notNull().default("open"),
	resolvedValue: jsonb("resolved_value"),
	resolution: text(),
	createdAt: timestamp("created_at").notNull().defaultNow(),
	resolvedAt: timestamp("resolved_at"),
});

/** Tracks each prompt evolution — what triggered it, what changed, did it help */
export const promptEvolutions = pgTable("prompt_evolutions", {
	id: serial().primaryKey(),
	layoutId: integer("layout_id")
		.references(() => layouts.id)
		.notNull(),
	fromPromptId: integer("from_prompt_id").references(() => prompts.id),
	toPromptId: integer("to_prompt_id").references(() => prompts.id),
	trigger: evolutionTriggerEnum().notNull(),
	errorsAnalyzed: jsonb("errors_analyzed"),
	changesMade: jsonb("changes_made"),
	reasoning: text(),
	scoreBefore: real("score_before"),
	scoreAfter: real("score_after"),
	accepted: boolean().notNull().default(false),
	createdAt: timestamp("created_at").notNull().defaultNow(),
});

/** Step-by-step logs for each pipeline run */
export const runLogs = pgTable("run_logs", {
	id: serial().primaryKey(),
	extractionId: integer("extraction_id").references(() => extractions.id),
	step: text().notNull(),
	level: text().notNull().default("info"),
	message: text().notNull(),
	data: jsonb(),
	createdAt: timestamp("created_at").notNull().defaultNow(),
});
