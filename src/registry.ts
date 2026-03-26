/**
 * Layout Registry
 *
 * Stores successful extractions as few-shot examples per format type.
 * When extracting a new PDF, the best matching example is included
 * in the prompt so the model learns from prior successes.
 */

import { readdir, readFile, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { FormatType } from "./schemas/bid-tabulation.js";
import type { ClassificationResult } from "./agents/classifier.js";
import type { BidTabulation } from "./schemas/bid-tabulation.js";

const REGISTRY_DIR = join(import.meta.dirname, "..", "registry");

export interface RegistryEntry {
	/** The format type */
	formatType: FormatType;
	/** Source PDF name */
	sourceFile: string;
	/** Classification details */
	classification: ClassificationResult;
	/** The validated extraction result */
	extraction: BidTabulation;
	/** First page image as base64 (for visual matching) */
	thumbnailBase64: string;
	/** When this entry was saved */
	savedAt: string;
	/** Number of corrections needed (lower = better example) */
	correctionsNeeded: number;
	/** Number of remaining warnings (lower = better example) */
	remainingWarnings: number;
}

/**
 * Get the best example for a given format type.
 * Prefers entries with fewer corrections and warnings.
 */
export async function getExample(
	formatType: FormatType,
): Promise<RegistryEntry | null> {
	const formatDir = join(REGISTRY_DIR, formatType);

	try {
		const files = await readdir(formatDir);
		const jsonFiles = files.filter((f) => f.endsWith(".json"));

		if (jsonFiles.length === 0) return null;

		// Load all entries and pick the best one
		const entries: RegistryEntry[] = [];
		for (const file of jsonFiles) {
			const content = await readFile(join(formatDir, file), "utf-8");
			entries.push(JSON.parse(content));
		}

		// Sort by quality: fewest corrections, then fewest warnings
		entries.sort((a, b) => {
			if (a.correctionsNeeded !== b.correctionsNeeded) {
				return a.correctionsNeeded - b.correctionsNeeded;
			}
			return a.remainingWarnings - b.remainingWarnings;
		});

		return entries[0];
	} catch {
		return null;
	}
}

/**
 * Get all examples for a given format type.
 */
export async function getExamples(
	formatType: FormatType,
): Promise<RegistryEntry[]> {
	const formatDir = join(REGISTRY_DIR, formatType);

	try {
		const files = await readdir(formatDir);
		const jsonFiles = files.filter((f) => f.endsWith(".json"));
		const entries: RegistryEntry[] = [];

		for (const file of jsonFiles) {
			const content = await readFile(join(formatDir, file), "utf-8");
			entries.push(JSON.parse(content));
		}

		return entries;
	} catch {
		return [];
	}
}

/**
 * Save a successful extraction as a registry example.
 */
export async function saveExample(
	classification: ClassificationResult,
	data: BidTabulation,
	firstPageImage: Buffer,
	correctionsNeeded: number,
): Promise<void> {
	const formatDir = join(REGISTRY_DIR, classification.formatType);
	await mkdir(formatDir, { recursive: true });

	// Use source file name (sanitized) as the entry filename
	const safeName = data.sourceFile
		.replace(/\.pdf$/i, "")
		.replace(/[^a-zA-Z0-9_-]/g, "_");

	const entry: RegistryEntry = {
		formatType: classification.formatType,
		sourceFile: data.sourceFile,
		classification,
		extraction: data,
		thumbnailBase64: firstPageImage.toString("base64"),
		savedAt: new Date().toISOString(),
		correctionsNeeded,
		remainingWarnings: data.extraction.warnings.length,
	};

	await writeFile(
		join(formatDir, `${safeName}.json`),
		JSON.stringify(entry, null, 2),
	);
}

/**
 * Build a few-shot example block for the extraction prompt.
 * Returns a text description of a prior successful extraction.
 */
export function buildFewShotPrompt(entry: RegistryEntry): string {
	// Strip the thumbnail and metadata to keep it concise
	const example = entry.extraction;

	return `Here is an example of a correctly extracted "${entry.formatType}" document:

Source: ${example.sourceFile}
Project: ${example.project.name}
Bidders: ${example.bidders.length}

Correct output:
${JSON.stringify(
	{
		project: example.project,
		engineerEstimate: example.engineerEstimate,
		bidders: example.bidders.map((b) => ({
			rank: b.rank,
			name: b.name,
			totalBaseBid: b.totalBaseBid,
			lineItems: b.lineItems?.slice(0, 3), // Just first 3 items as example
		})),
	},
	null,
	2,
)}

Use this as a reference for the structure and level of detail expected.`;
}
