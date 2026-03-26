/**
 * Extraction pipeline with self-correction loop.
 *
 * Flow: images → classify → extract → math resolve → validate → correct → validate → ... → done
 *
 * Everything is logged to the DB. Every step, every correction, every result.
 */

import { basename } from "node:path";
import { classifyDocument } from "./agents/classifier.js";
import { correctExtraction } from "./agents/corrector.js";
import { extractBidData } from "./agents/extractor.js";
import { resolveMath } from "./agents/math-resolver.js";
import { validateBidTabulation } from "./agents/validator.js";
import {
	createExtraction,
	updateExtraction,
	findOrCreateLayout,
	createEval,
} from "./db/operations.js";
import { PipelineLogger } from "./db/logger.js";
import type { BidTabulation } from "./schemas/bid-tabulation.js";
import { pdfToImages } from "./utils/pdf-to-images.js";

export interface PipelineResult {
	data: BidTabulation;
	extractionId: number;
	corrections: number;
	mathCorrections: number;
	finalValid: boolean;
}

export async function runPipeline(
	pdfPath: string,
	maxCorrections = 2,
): Promise<PipelineResult> {
	const startTime = Date.now();
	const logger = new PipelineLogger();
	const pdfFile = basename(pdfPath);

	// Create extraction record immediately
	const extraction = await createExtraction({ pdfFile });
	logger.setExtractionId(extraction.id);

	// Step 1: Convert PDF to images
	const pages = await pdfToImages(pdfPath);
	const images = pages.map((p) => p.image);
	await logger.log("render", `${pages.length} page(s)`, {
		pageCount: pages.length,
	});

	// Step 2: Classify
	const classification = await classifyDocument(images);
	await logger.log(
		"classify",
		`→ ${classification.formatType} (${Math.round(classification.confidence * 100)}%), ${classification.bidderCount} bidders`,
		classification,
	);

	// Step 2b: Find or create layout
	const fingerprint = `${classification.formatType}:${classification.bidderCount}b:${classification.hasLineItems ? "li" : "no-li"}:${classification.hasAlternates ? "alt" : "no-alt"}:${pages.length}p`;
	const layout = await findOrCreateLayout(
		fingerprint,
		`${classification.formatType} (${classification.bidderCount} bidders, ${pages.length}p)`,
		classification.formatType,
		{
			bidderCount: classification.bidderCount,
			hasLineItems: classification.hasLineItems,
			hasAlternates: classification.hasAlternates,
			hasHandwriting: classification.hasHandwriting,
			hasEngineerEstimate: classification.hasEngineerEstimate,
			pageCount: pages.length,
		},
	);

	await updateExtraction(extraction.id, { layoutId: layout.id });

	// Step 3: Extract (retry once on JSON parse failure)
	let data: BidTabulation;
	try {
		data = await extractBidData(images, classification, pdfFile);
	} catch (err) {
		if (err instanceof SyntaxError) {
			await logger.warn("extract", "JSON parse failed, retrying...");
			data = await extractBidData(images, classification, pdfFile);
		} else {
			await logger.error(
				"extract",
				`Failed: ${err instanceof Error ? err.message : err}`,
			);
			throw err;
		}
	}

	const totalLineItems = data.bidders.reduce(
		(sum, b) => sum + (b.lineItems?.length ?? 0),
		0,
	);
	await logger.log("extract", `→ extracted ${data.bidders.length} bidders, ${totalLineItems} line items`, {
		bidderCount: data.bidders.length,
		lineItemCount: totalLineItems,
	});

	// Step 4: Math resolver (deterministic, no LLM call)
	const mathResult = resolveMath(data);
	if (mathResult.corrected > 0) {
		await logger.log("math-resolve", `fixed ${mathResult.corrected} values`, {
			corrected: mathResult.corrected,
			corrections: mathResult.corrections,
		});
	}

	// Step 5: Validate after math resolution
	let validation = validateBidTabulation(data);
	let corrections = 0;

	if (validation.errors.length > 0 || validation.warnings.length > 0) {
		await logger.log(
			"validate",
			`${validation.errors.length} errors, ${validation.warnings.length} warnings`,
			{ errors: validation.errors, warnings: validation.warnings },
		);
	}

	// Step 6: LLM correction loop
	while (
		(validation.errors.length > 0 || validation.warnings.length > 0) &&
		corrections < maxCorrections
	) {
		corrections++;
		await logger.log("correct", `LLM correction #${corrections}`);

		try {
			data = await correctExtraction(
				images,
				data,
				validation.warnings,
				validation.errors,
			);

			const postMath = resolveMath(data);
			if (postMath.corrected > 0) {
				await logger.log("math-resolve", `post-correction: fixed ${postMath.corrected} more`);
			}

			validation = validateBidTabulation(data);
			await logger.log(
				"validate",
				`${validation.errors.length} errors, ${validation.warnings.length} warnings remaining`,
			);
		} catch (err) {
			await logger.error(
				"correct",
				`Failed: ${err instanceof Error ? err.message : err}`,
			);
			break;
		}
	}

	// Finalize
	data.extraction.warnings = validation.warnings;
	data.extraction.processingTimeMs = Date.now() - startTime;

	const finalLineItems = data.bidders.reduce(
		(sum, b) => sum + (b.lineItems?.length ?? 0),
		0,
	);

	await updateExtraction(extraction.id, {
		resultJson: data as unknown as Record<string, unknown>,
		bidderCount: data.bidders.length,
		lineItemCount: finalLineItems,
		warningCount: validation.warnings.length,
		errorCount: validation.errors.length,
		mathCorrections: mathResult.corrected,
		llmCorrections: corrections,
		processingTimeMs: Date.now() - startTime,
	});

	// Score it
	const mathScore = computeMathScore(data);
	const completenessScore = computeCompletenessScore(data, classification);
	const overall = Math.round((mathScore + completenessScore) / 2);

	await createEval({
		extractionId: extraction.id,
		layoutId: layout.id,
		mathScore,
		completenessScore,
		overallScore: overall,
		details: {
			warningCount: validation.warnings.length,
			errorCount: validation.errors.length,
			corrections,
			mathCorrections: mathResult.corrected,
		},
	});

	await logger.log("done", `score=${overall} (math=${mathScore}, completeness=${completenessScore})`, {
		mathScore,
		completenessScore,
		overall,
	});

	return {
		data,
		extractionId: extraction.id,
		corrections,
		mathCorrections: mathResult.corrected,
		finalValid: validation.errors.length === 0,
	};
}

/** Score: what % of line items have correct math (unit × qty = extended) */
function computeMathScore(data: BidTabulation): number {
	let total = 0;
	let correct = 0;

	for (const bidder of data.bidders) {
		for (const item of bidder.lineItems ?? []) {
			if (item.unitPrice != null && item.quantity != null && item.extendedPrice != null) {
				total++;
				const expected = Math.round(item.unitPrice * item.quantity * 100) / 100;
				if (Math.abs(expected - item.extendedPrice) <= 0.01) {
					correct++;
				}
			}
		}
	}

	return total === 0 ? 100 : Math.round((correct / total) * 100);
}

/** Score: did we get the expected number of bidders and line items? */
function computeCompletenessScore(
	data: BidTabulation,
	classification: { bidderCount: number; hasLineItems: boolean },
): number {
	let score = 100;

	// Bidder count check
	if (data.bidders.length < classification.bidderCount) {
		const ratio = data.bidders.length / classification.bidderCount;
		score = Math.round(score * ratio);
	}

	// Line items check — if classifier says there should be line items
	if (classification.hasLineItems) {
		const biddersWithItems = data.bidders.filter(
			(b) => b.lineItems && b.lineItems.length > 0,
		).length;
		if (biddersWithItems === 0) {
			score = Math.round(score * 0.2); // Major penalty for 0 line items
		} else if (biddersWithItems < data.bidders.length) {
			const ratio = biddersWithItems / data.bidders.length;
			score = Math.round(score * ratio);
		}
	}

	return score;
}
