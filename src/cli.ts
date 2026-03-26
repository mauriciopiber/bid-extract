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

// Always close DB after command finishes
program.hook("postAction", async () => {
	await closeDb();
});

program.parse();
