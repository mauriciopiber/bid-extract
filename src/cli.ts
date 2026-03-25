#!/usr/bin/env node

/**
 * bid-extract CLI
 *
 * Usage:
 *   pnpm cli extract <pdf-or-directory>    Extract bid data from PDF(s)
 *   pnpm cli classify <pdf>                Classify a single PDF format
 *   pnpm cli validate <json>               Validate extracted JSON
 */

import { Command } from "commander";

const program = new Command();

program
	.name("bid-extract")
	.description("Extract structured data from bid tabulation PDFs")
	.version("0.1.0");

program
	.command("extract")
	.description("Extract bid data from one or more PDFs")
	.argument("<path>", "PDF file or directory of PDFs")
	.option("-o, --output <dir>", "Output directory", "./output")
	.option("--concurrency <n>", "Max concurrent extractions", "5")
	.action(async (path, options) => {
		console.log(`Extracting from: ${path}`);
		console.log(`Output: ${options.output}`);
		// TODO: Wire up pipeline
	});

program
	.command("classify")
	.description("Classify a PDF format without extracting")
	.argument("<pdf>", "PDF file path")
	.action(async (pdf) => {
		console.log(`Classifying: ${pdf}`);
		// TODO: Wire up classifier
	});

program.parse();
