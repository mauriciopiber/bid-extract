/**
 * Client Gear
 *
 * Outer loop — feeds documents into the document gear.
 *
 * 1. Load/create client
 * 2. Queue all PDFs as documents
 * 3. Process each through document gear
 * 4. Track overall progress
 * 5. Done when all documents are done or reviewing
 */

import { readdir } from "node:fs/promises";
import { basename, join } from "node:path";
import { eq, and } from "drizzle-orm";
import { db, schema } from "../db/index.js";
import { processDocument } from "./document-gear.js";

export interface ClientGearResult {
	clientId: number;
	total: number;
	done: number;
	reviewing: number;
	failed: number;
	queued: number;
}

/** Create a client and queue all PDFs from a directory */
export async function createClient(
	name: string,
	pdfDir: string,
): Promise<number> {
	const files = await readdir(pdfDir);
	const pdfFiles = files
		.filter((f) => f.toLowerCase().endsWith(".pdf"))
		.sort();

	// Create client
	const [client] = await db
		.insert(schema.clients)
		.values({
			name,
			totalDocuments: pdfFiles.length,
		})
		.returning();

	// Queue all documents
	for (const file of pdfFiles) {
		await db.insert(schema.documents).values({
			clientId: client.id,
			pdfFile: file,
			pdfPath: join(pdfDir, file),
		});
	}

	console.log(`Created client "${name}" with ${pdfFiles.length} documents`);
	return client.id;
}

/** Get client progress */
export async function getClientProgress(
	clientId: number,
): Promise<ClientGearResult> {
	const docs = await db
		.select()
		.from(schema.documents)
		.where(eq(schema.documents.clientId, clientId));

	return {
		clientId,
		total: docs.length,
		done: docs.filter((d) => d.status === "done").length,
		reviewing: docs.filter((d) => d.status === "reviewing").length,
		failed: docs.filter((d) => d.status === "failed").length,
		queued: docs.filter(
			(d) => d.status === "queued" || d.status === "re_extracting",
		).length,
	};
}

/** Run the client gear — process all queued documents */
export async function runClientGear(
	clientId: number,
	limit?: number,
): Promise<ClientGearResult> {
	// Update client status
	await db
		.update(schema.clients)
		.set({ status: "processing", updatedAt: new Date() })
		.where(eq(schema.clients.id, clientId));

	// Get queued documents
	const docs = await db
		.select()
		.from(schema.documents)
		.where(
			and(
				eq(schema.documents.clientId, clientId),
				eq(schema.documents.status, "queued"),
			),
		);

	const toProcess = limit ? docs.slice(0, limit) : docs;
	console.log(
		`\nProcessing ${toProcess.length}/${docs.length} queued documents for client #${clientId}\n`,
	);

	for (const doc of toProcess) {
		await processDocument(doc.id);
	}

	// Get final progress
	const progress = await getClientProgress(clientId);

	// Update client
	const clientStatus =
		progress.queued === 0 && progress.reviewing === 0
			? "done"
			: progress.queued === 0
				? "reviewing"
				: "processing";

	await db
		.update(schema.clients)
		.set({
			status: clientStatus,
			completedDocuments: progress.done,
			updatedAt: new Date(),
		})
		.where(eq(schema.clients.id, clientId));

	console.log(`\n=== Client Progress ===`);
	console.log(`Total:     ${progress.total}`);
	console.log(`Done:      ${progress.done}`);
	console.log(`Reviewing: ${progress.reviewing}`);
	console.log(`Failed:    ${progress.failed}`);
	console.log(`Queued:    ${progress.queued}`);

	return progress;
}
