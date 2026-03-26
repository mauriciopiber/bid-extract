#!/usr/bin/env node

/**
 * bid-extract CLI
 *
 * Thin wrapper around actions. DB is the source of truth.
 */

import "dotenv/config";
import { resolve, basename } from "node:path";
import { Command } from "commander";
import { closeDb } from "./db/index.js";
import { extractAction } from "./actions/extract.js";
import { statsAction } from "./actions/stats.js";
import {
	listExtractionsAction,
	getExtractionAction,
} from "./actions/extractions.js";
import { dumpAction } from "./actions/dump.js";
import { classifyDocument } from "./agents/classifier.js";
import { pdfToImages } from "./utils/pdf-to-images.js";

const program = new Command();

program
	.name("bid-extract")
	.description("Extract structured data from bid tabulation PDFs")
	.version("0.1.0");

program
	.command("extract")
	.description("Extract bid data from one or more PDFs")
	.argument("<path>", "PDF file or directory of PDFs")
	.option("--max-corrections <n>", "Max correction rounds per PDF", "2")
	.action(async (path, options) => {
		await extractAction.cli({
			path,
			maxCorrections: Number.parseInt(options.maxCorrections, 10),
		});
	});

program
	.command("classify")
	.description("Classify a PDF format without extracting")
	.argument("<pdf>", "PDF file path")
	.action(async (pdf) => {
		const pdfPath = resolve(pdf);
		console.log(`Classifying: ${basename(pdfPath)}\n`);
		const pages = await pdfToImages(pdfPath);
		const result = await classifyDocument(pages.map((p) => p.image));
		console.log(`Format:      ${result.formatType}`);
		console.log(`Confidence:  ${Math.round(result.confidence * 100)}%`);
		console.log(`Bidders:     ${result.bidderCount}`);
		console.log(`Pages:       ${result.pageCount}`);
		console.log(`Line items:  ${result.hasLineItems}`);
		console.log(`Alternates:  ${result.hasAlternates}`);
		console.log(`Handwriting: ${result.hasHandwriting}`);
		console.log(`Eng. est.:   ${result.hasEngineerEstimate}`);
		console.log(`Notes:       ${result.notes}`);
	});

program
	.command("stats")
	.description("Show accuracy stats from DB")
	.action(async () => {
		await statsAction.cli({});
	});

program
	.command("extractions")
	.description("List recent extractions")
	.option("-n, --limit <n>", "Number to show", "20")
	.action(async (options) => {
		await listExtractionsAction.cli({
			limit: Number.parseInt(options.limit, 10),
		});
	});

program
	.command("show")
	.description("Show extraction details with pipeline steps and scores")
	.argument("<id>", "Extraction ID")
	.action(async (id) => {
		await getExtractionAction.cli({ id: Number.parseInt(id, 10) });
	});

program
	.command("dump")
	.description("Dump extraction from DB to disk (debug)")
	.argument("<id>", "Extraction ID")
	.option("-o, --output <dir>", "Output directory", "./output")
	.action(async (id, options) => {
		await dumpAction.cli({
			id: Number.parseInt(id, 10),
			output: options.output,
		});
	});

program
	.command("reset")
	.description("Wipe all extraction data (keeps page types, prompts learning)")
	.action(async () => {
		const { sql } = await import("drizzle-orm");
		const { db } = await import("./db/index.js");
		await db.execute(
			sql`TRUNCATE run_logs, page_extractions, evals, contests, prompt_evolutions, extractions, documents, clients, layouts CASCADE`,
		);
		console.log("Wiped: extractions, evals, logs, layouts, documents, clients");
		console.log("Kept: page_types");
	});

// -- Gear commands --

program
	.command("client:create")
	.description("Create a client and queue all PDFs from a directory")
	.argument("<name>", "Client name")
	.argument("<pdf-dir>", "Directory containing PDFs")
	.action(async (name, pdfDir) => {
		const { createClient } = await import("./gear/client-gear.js");
		await createClient(name, resolve(pdfDir));
	});

program
	.command("client:run")
	.description("Run the gear — process queued documents for a client")
	.argument("<id>", "Client ID")
	.option("-n, --limit <n>", "Max documents to process")
	.action(async (id, options) => {
		const { runClientGear } = await import("./gear/client-gear.js");
		const limit = options.limit ? Number.parseInt(options.limit, 10) : undefined;
		await runClientGear(Number.parseInt(id, 10), limit);
	});

program
	.command("client:status")
	.description("Show client progress")
	.argument("<id>", "Client ID")
	.action(async (id) => {
		const { getClientProgress } = await import("./gear/client-gear.js");
		const progress = await getClientProgress(Number.parseInt(id, 10));
		console.log(`\nTotal:     ${progress.total}`);
		console.log(`Done:      ${progress.done}`);
		console.log(`Reviewing: ${progress.reviewing}`);
		console.log(`Failed:    ${progress.failed}`);
		console.log(`Queued:    ${progress.queued}`);
	});

program
	.command("doc:process")
	.description("Process a single document through the gear")
	.argument("<id>", "Document ID")
	.action(async (id) => {
		const { processDocument } = await import("./gear/document-gear.js");
		await processDocument(Number.parseInt(id, 10));
	});

program
	.command("doc:reprocess")
	.description("Re-process a document after contest resolution")
	.argument("<id>", "Document ID")
	.action(async (id) => {
		const { reprocessDocument } = await import("./gear/document-gear.js");
		await reprocessDocument(Number.parseInt(id, 10));
	});

// Always close DB after command finishes
program.hook("postAction", async () => {
	await closeDb();
});

program.parse();
