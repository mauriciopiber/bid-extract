/**
 * Document Gear
 *
 * Takes one document through the full cycle:
 * queued → classifying → extracting → validating → (reviewing | done)
 *
 * If score < 100 → reviewing (needs human feedback)
 * If score = 100 → done
 *
 * After human contest + prompt evolution → re_extracting → back to validating
 */

import { eq } from "drizzle-orm";
import { db, schema } from "../db/index.js";
import { runPipeline } from "../pipeline.js";

export interface DocumentGearResult {
	documentId: number;
	status: string;
	score: number | null;
	extractionId: number | null;
	attempt: number;
}

async function setDocStatus(
	docId: number,
	status: string,
	extra?: Record<string, unknown>,
) {
	await db
		.update(schema.documents)
		.set({
			status: status as typeof schema.documents.$inferSelect.status,
			updatedAt: new Date(),
			...extra,
		})
		.where(eq(schema.documents.id, docId));
}

export async function processDocument(
	docId: number,
): Promise<DocumentGearResult> {
	const [doc] = await db
		.select()
		.from(schema.documents)
		.where(eq(schema.documents.id, docId));

	if (!doc) throw new Error(`Document #${docId} not found`);

	const attempt = doc.attempt + 1;
	console.log(
		`\n[doc #${doc.id}] ${doc.pdfFile} — attempt ${attempt}`,
	);

	// Classify
	await setDocStatus(doc.id, "classifying", { attempt });

	// Extract (pipeline handles classify + extract + validate + score)
	await setDocStatus(doc.id, "extracting");

	let result;
	try {
		result = await runPipeline(doc.pdfPath);
	} catch (err) {
		console.error(
			`  ✗ failed: ${err instanceof Error ? err.message : err}`,
		);
		await setDocStatus(doc.id, "failed");
		return {
			documentId: doc.id,
			status: "failed",
			score: null,
			extractionId: null,
			attempt,
		};
	}

	// Get the eval score
	const [evalResult] = await db
		.select()
		.from(schema.evals)
		.where(eq(schema.evals.extractionId, result.extractionId));

	const score = evalResult?.overallScore ?? 0;

	// Validate
	await setDocStatus(doc.id, "validating");

	// Decide: done or needs review
	const isDone = score >= 100 && result.finalValid;
	const finalStatus = isDone ? "done" : "reviewing";

	await setDocStatus(doc.id, finalStatus, {
		extractionId: result.extractionId,
		score,
	});

	console.log(
		`  ${isDone ? "✓" : "→"} score=${score}, status=${finalStatus}, extraction=#${result.extractionId}`,
	);

	return {
		documentId: doc.id,
		status: finalStatus,
		score,
		extractionId: result.extractionId,
		attempt,
	};
}

/** Re-process a document after contest resolution / prompt evolution */
export async function reprocessDocument(
	docId: number,
): Promise<DocumentGearResult> {
	await setDocStatus(docId, "re_extracting");
	return processDocument(docId);
}
