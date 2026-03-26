/**
 * Contest System
 *
 * Allows flagging specific extracted values as "contested" — meaning
 * a human reviewer thinks they're wrong. Contests are stored as JSON
 * files and can be resolved by re-examining the specific values.
 *
 * Contest lifecycle:
 *   open → resolving → resolved | unresolvable
 */

import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

const CONTESTS_DIR = join(import.meta.dirname, "..", "contests");

export interface Contest {
	id: string;
	/** Which extraction file */
	sourceFile: string;
	/** Path to the contested value: "bidders.0.lineItems.7.unitPrice" */
	fieldPath: string;
	/** The current (possibly wrong) value */
	currentValue: unknown;
	/** What the reviewer thinks it should be (optional hint) */
	suggestedValue?: unknown;
	/** Why it's being contested */
	reason: string;
	/** Contest status */
	status: "open" | "resolving" | "resolved" | "unresolvable";
	/** The resolved value (after fix) */
	resolvedValue?: unknown;
	/** How it was resolved */
	resolution?: string;
	/** Timestamps */
	createdAt: string;
	resolvedAt?: string;
}

export async function createContest(
	sourceFile: string,
	fieldPath: string,
	currentValue: unknown,
	reason: string,
	suggestedValue?: unknown,
): Promise<Contest> {
	await mkdir(CONTESTS_DIR, { recursive: true });

	const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
	const contest: Contest = {
		id,
		sourceFile,
		fieldPath,
		currentValue,
		suggestedValue,
		reason,
		status: "open",
		createdAt: new Date().toISOString(),
	};

	const safeName = sourceFile.replace(/\.pdf$/i, "").replace(/[^a-zA-Z0-9_-]/g, "_");
	const dir = join(CONTESTS_DIR, safeName);
	await mkdir(dir, { recursive: true });
	await writeFile(join(dir, `${id}.json`), JSON.stringify(contest, null, 2));

	return contest;
}

export async function getContests(
	sourceFile?: string,
	status?: Contest["status"],
): Promise<Contest[]> {
	const contests: Contest[] = [];

	try {
		const dirs = await readdir(CONTESTS_DIR);
		for (const dir of dirs) {
			const dirPath = join(CONTESTS_DIR, dir);
			const files = await readdir(dirPath);
			for (const file of files) {
				if (!file.endsWith(".json")) continue;
				const content = await readFile(join(dirPath, file), "utf-8");
				const contest: Contest = JSON.parse(content);
				if (sourceFile && contest.sourceFile !== sourceFile) continue;
				if (status && contest.status !== status) continue;
				contests.push(contest);
			}
		}
	} catch {
		// No contests yet
	}

	return contests.sort(
		(a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
	);
}

export async function updateContest(contest: Contest): Promise<void> {
	const safeName = contest.sourceFile
		.replace(/\.pdf$/i, "")
		.replace(/[^a-zA-Z0-9_-]/g, "_");
	const dir = join(CONTESTS_DIR, safeName);
	await writeFile(join(dir, `${contest.id}.json`), JSON.stringify(contest, null, 2));
}

/**
 * Apply a resolved contest to the extraction JSON.
 * Sets the value at fieldPath to resolvedValue.
 */
export function applyContest(
	// biome-ignore lint: dynamic object
	data: any,
	fieldPath: string,
	value: unknown,
): void {
	const parts = fieldPath.split(".");
	let current = data;
	for (let i = 0; i < parts.length - 1; i++) {
		const key = /^\d+$/.test(parts[i]) ? Number(parts[i]) : parts[i];
		current = current[key];
		if (current == null) return;
	}
	const lastKey = parts[parts.length - 1];
	current[lastKey] = value;
}
