/**
 * Extraction pipeline with self-correction loop.
 *
 * Flow: images → classify → extract → math resolve → validate → correct → validate → ... → done
 *
 * The math resolver runs BEFORE the LLM corrector. It fixes deterministic
 * errors (misread digits) using math relationships between unit price,
 * quantity, and extended price. Only issues it can't fix go to the LLM.
 */

import { basename } from "node:path";
import { classifyDocument } from "./agents/classifier.js";
import { correctExtraction } from "./agents/corrector.js";
import { extractBidData } from "./agents/extractor.js";
import { resolveMath } from "./agents/math-resolver.js";
import { validateBidTabulation } from "./agents/validator.js";
import { saveExample } from "./registry.js";
import type { BidTabulation } from "./schemas/bid-tabulation.js";
import { pdfToImages } from "./utils/pdf-to-images.js";

export interface PipelineResult {
	data: BidTabulation;
	corrections: number;
	mathCorrections: number;
	finalValid: boolean;
}

export async function runPipeline(
	pdfPath: string,
	maxCorrections = 2,
	log = console.log,
): Promise<PipelineResult> {
	const startTime = Date.now();

	// Step 1: Convert PDF to images
	const pages = await pdfToImages(pdfPath);
	const images = pages.map((p) => p.image);
	log(`  ${pages.length} page(s)`);

	// Step 2: Classify
	const classification = await classifyDocument(images);
	log(
		`  → ${classification.formatType} (${Math.round(classification.confidence * 100)}%), ${classification.bidderCount} bidders`,
	);

	// Step 3: Extract (retry once on JSON parse failure)
	let data: BidTabulation;
	try {
		data = await extractBidData(images, classification, basename(pdfPath));
	} catch (err) {
		if (err instanceof SyntaxError) {
			log("  → JSON parse failed, retrying extraction...");
			data = await extractBidData(images, classification, basename(pdfPath));
		} else {
			throw err;
		}
	}

	log(
		`  → extracted ${data.bidders.length} bidders`,
	);

	// Step 4: Math resolver (deterministic, no LLM call)
	const mathResult = resolveMath(data);
	if (mathResult.corrected > 0) {
		log(
			`  → math resolver: fixed ${mathResult.corrected} values`,
		);
		for (const c of mathResult.corrections) {
			log(`    ${c}`);
		}
	}

	// Step 5: Validate after math resolution
	let validation = validateBidTabulation(data);
	let corrections = 0;

	if (validation.errors.length > 0 || validation.warnings.length > 0) {
		log(
			`  → after math: ${validation.errors.length} errors, ${validation.warnings.length} warnings`,
		);
	}

	// Step 6: LLM correction loop (only for issues math resolver couldn't fix)
	while (
		(validation.errors.length > 0 || validation.warnings.length > 0) &&
		corrections < maxCorrections
	) {
		corrections++;
		log(`  → LLM correction #${corrections}...`);

		try {
			data = await correctExtraction(
				images,
				data,
				validation.warnings,
				validation.errors,
			);

			// Run math resolver again on corrected data
			const postCorrectionMath = resolveMath(data);
			if (postCorrectionMath.corrected > 0) {
				log(
					`    math resolver: fixed ${postCorrectionMath.corrected} more values`,
				);
			}

			validation = validateBidTabulation(data);
			log(
				`    ${validation.errors.length} errors, ${validation.warnings.length} warnings remaining`,
			);
		} catch (err) {
			log(
				`    correction failed: ${err instanceof Error ? err.message : err}`,
			);
			break;
		}
	}

	// Finalize
	data.extraction.warnings = validation.warnings;
	data.extraction.processingTimeMs = Date.now() - startTime;

	// Save to registry if extraction succeeded (valid or only warnings)
	if (validation.errors.length === 0) {
		try {
			await saveExample(classification, data, images[0], corrections);
			log(`  → saved to registry (${classification.formatType})`);
		} catch (err) {
			log(
				`  → registry save failed: ${err instanceof Error ? err.message : err}`,
			);
		}
	}

	return {
		data,
		corrections,
		mathCorrections: mathResult.corrected,
		finalValid: validation.errors.length === 0,
	};
}
