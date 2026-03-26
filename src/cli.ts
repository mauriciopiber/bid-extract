#!/usr/bin/env node

/**
 * bid-extract CLI
 *
 * Usage:
 *   pnpm cli extract <pdf-or-directory>    Extract bid data from PDF(s)
 *   pnpm cli classify <pdf>                Classify a single PDF format
 */

import "dotenv/config";
import { readdir, mkdir, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { Command } from "commander";
import { resolveContest } from "./agents/contest-resolver.js";
import { classifyDocument } from "./agents/classifier.js";
import { applyContest, getContests, updateContest } from "./contests.js";
import { runPipeline } from "./pipeline.js";
import { generateReport } from "./review/generate-report.js";
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
	.option("-o, --output <dir>", "Output directory", "./output")
	.option("--concurrency <n>", "Max concurrent extractions", "3")
	.option("--max-corrections <n>", "Max correction rounds per PDF", "2")
	.action(async (inputPath, options) => {
		const resolvedPath = resolve(inputPath);
		const outputDir = resolve(options.output);
		await mkdir(outputDir, { recursive: true });

		// Collect PDF files
		let pdfFiles: string[];
		const stat = await import("node:fs").then((fs) =>
			fs.statSync(resolvedPath),
		);
		if (stat.isDirectory()) {
			const files = await readdir(resolvedPath);
			pdfFiles = files
				.filter((f) => f.toLowerCase().endsWith(".pdf"))
				.map((f) => join(resolvedPath, f));
		} else {
			pdfFiles = [resolvedPath];
		}

		console.log(`Found ${pdfFiles.length} PDF(s) to process\n`);

		const concurrency = Number.parseInt(options.concurrency, 10);
		const maxCorrections = Number.parseInt(options.maxCorrections, 10);
		let completed = 0;
		let failed = 0;

		// Process in batches
		for (let i = 0; i < pdfFiles.length; i += concurrency) {
			const batch = pdfFiles.slice(i, i + concurrency);
			await Promise.allSettled(
				batch.map(async (pdfPath) => {
					const name = basename(pdfPath, ".pdf");
					try {
						console.log(
							`[${completed + failed + 1}/${pdfFiles.length}] ${name}`,
						);

						const result = await runPipeline(
							pdfPath,
							maxCorrections,
							(msg: string) => console.log(msg),
						);

						// Write output
						const outPath = join(outputDir, `${name}.json`);
						await writeFile(
							outPath,
							JSON.stringify(result.data, null, 2),
						);

						const status = result.finalValid ? "✓" : "⚠";
						console.log(
							`  ${status} ${result.data.bidders.length} bidders, ${result.corrections} corrections, ${result.data.extraction.processingTimeMs}ms\n`,
						);

						completed++;
					} catch (err) {
						console.error(
							`  ✗ ${name}: ${err instanceof Error ? err.message : err}\n`,
						);
						failed++;
					}
				}),
			);
		}

		console.log(
			`Done: ${completed} succeeded, ${failed} failed out of ${pdfFiles.length}`,
		);
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
	.command("review")
	.description("Generate HTML review report from extracted data")
	.option("-o, --output <dir>", "Output directory with JSON files", "./output")
	.option("-r, --report <file>", "Report output path", "./review.html")
	.action(async (options) => {
		const outputDir = resolve(options.output);
		const reportPath = resolve(options.report);

		console.log(`Generating review from ${outputDir}...`);
		await generateReport(outputDir, reportPath);
		console.log(`Review report: ${reportPath}`);
		console.log(`Open in browser: file://${reportPath}`);
	});

program
	.command("resolve-contests")
	.description("Resolve open contests by re-examining the PDF")
	.option("-o, --output <dir>", "Output directory", "./output")
	.option("--pdf-dir <dir>", "PDF source directory", "/tmp/bid-tabs")
	.action(async (options) => {
		const outputDir = resolve(options.output);
		const pdfDir = resolve(options.pdfDir);

		const openContests = await getContests(undefined, "open");
		if (openContests.length === 0) {
			console.log("No open contests.");
			return;
		}

		console.log(`Found ${openContests.length} open contest(s)\n`);

		// Group by source file
		const byFile = new Map<string, typeof openContests>();
		for (const c of openContests) {
			const existing = byFile.get(c.sourceFile) || [];
			existing.push(c);
			byFile.set(c.sourceFile, existing);
		}

		for (const [sourceFile, contests] of byFile) {
			console.log(`${sourceFile} — ${contests.length} contest(s)`);

			// Load extraction data
			const jsonName = sourceFile.replace(/\.pdf$/i, "");
			const { readFile, writeFile } = await import("node:fs/promises");
			const dataPath = join(outputDir, `${jsonName}.json`);

			let data;
			try {
				data = JSON.parse(await readFile(dataPath, "utf-8"));
			} catch {
				console.log(`  ✗ Cannot read ${dataPath}`);
				continue;
			}

			// Load PDF at higher DPI for better accuracy
			const pdfPath = join(pdfDir, sourceFile);
			let pages;
			try {
				pages = await pdfToImages(pdfPath, 300);
			} catch {
				console.log(`  ✗ Cannot read PDF ${pdfPath}`);
				continue;
			}

			const images = pages.map((p) => p.image);

			for (const contest of contests) {
				console.log(`  → ${contest.fieldPath}: "${contest.reason}"`);
				contest.status = "resolving";
				await updateContest(contest);

				try {
					const result = await resolveContest(images, contest, data);
					console.log(
						`    resolved: ${JSON.stringify(result.value)} (${Math.round(result.confidence * 100)}% confidence)`,
					);
					console.log(`    reason: ${result.explanation}`);

					// Apply the fix
					applyContest(data, contest.fieldPath, result.value);
					contest.resolvedValue = result.value;
					contest.resolution = result.explanation;
					contest.status = "resolved";
					contest.resolvedAt = new Date().toISOString();
					await updateContest(contest);
				} catch (err) {
					console.log(
						`    ✗ failed: ${err instanceof Error ? err.message : err}`,
					);
					contest.status = "unresolvable";
					contest.resolution = `Error: ${err instanceof Error ? err.message : err}`;
					await updateContest(contest);
				}
			}

			// Save updated extraction
			await writeFile(dataPath, JSON.stringify(data, null, 2));
			console.log(`  ✓ Updated ${dataPath}\n`);
		}
	});

program.parse();
