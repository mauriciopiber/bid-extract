/**
 * Generate an HTML review report.
 *
 * For each extracted PDF, shows:
 * - First page image (rendered from PDF)
 * - Extracted data (formatted)
 * - Registry example used (if any)
 * - Validation warnings/errors
 * - Confidence and correction count
 *
 * This lets a human quickly verify extractions are correct.
 */

import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
// biome-ignore lint: legacy module
type BidTabulation = any;
import { pdfToImages } from "../utils/pdf-to-images.js";

interface ReviewItem {
	data: BidTabulation;
	thumbnailBase64: string;
}

async function loadExtractions(outputDir: string): Promise<ReviewItem[]> {
	const files = await readdir(outputDir);
	const jsonFiles = files.filter((f) => f.endsWith(".json")).sort();

	const items: ReviewItem[] = [];
	for (const file of jsonFiles) {
		const content = await readFile(join(outputDir, file), "utf-8");
		const data: BidTabulation = JSON.parse(content);

		// Try to render first page from source PDF
		let thumbnailBase64 = "";
		try {
			const pdfPath = join("/tmp/bid-tabs", data.sourceFile);
			const pages = await pdfToImages(pdfPath, 150); // lower DPI for thumbnails
			if (pages.length > 0) {
				thumbnailBase64 = pages[0].image.toString("base64");
			}
		} catch {
			// PDF not found, skip thumbnail
		}

		items.push({ data, thumbnailBase64 });
	}

	return items;
}

function renderItem(item: ReviewItem, index: number): string {
	const { data } = item;
	const hasWarnings = data.extraction.warnings.length > 0;
	const statusClass = hasWarnings ? "warning" : "success";
	const statusIcon = hasWarnings ? "⚠️" : "✅";

	const biddersHtml = data.bidders
		.map(
			(b: any) => `
		<div class="bidder">
			<div class="bidder-header">
				<span class="rank">#${b.rank}</span>
				<strong>${b.name}</strong>
				${b.totalBaseBid ? `<span class="total">$${b.totalBaseBid.toLocaleString()}</span>` : ""}
			</div>
			${b.address ? `<div class="detail">📍 ${b.address}</div>` : ""}
			${
				b.lineItems && b.lineItems.length > 0
					? `<table class="line-items">
					<thead><tr><th>#</th><th>Description</th><th>Unit</th><th>Qty</th><th>Unit $</th><th>Ext $</th></tr></thead>
					<tbody>
					${b.lineItems
						.map(
							(li: any) => `<tr>
						<td>${li.itemNo}</td>
						<td>${li.description}</td>
						<td>${li.unit || ""}</td>
						<td>${li.quantity ?? ""}</td>
						<td>${li.unitPrice != null ? `$${li.unitPrice.toLocaleString()}` : ""}</td>
						<td>${li.extendedPrice != null ? `$${li.extendedPrice.toLocaleString()}` : ""}</td>
					</tr>`,
						)
						.join("")}
					</tbody>
				</table>`
					: "<em>No line items</em>"
			}
		</div>`,
		)
		.join("");

	const warningsHtml =
		data.extraction.warnings.length > 0
			? `<div class="warnings">
			<strong>Warnings:</strong>
			<ul>${data.extraction.warnings.map((w: any) => `<li>${w}</li>`).join("")}</ul>
		</div>`
			: "";

	const engineerHtml = data.engineerEstimate
		? `<div class="engineer">
			<strong>Engineer's Estimate:</strong> $${data.engineerEstimate.total.toLocaleString()}
		</div>`
		: "";

	return `
	<div class="review-item ${statusClass}" id="item-${index}">
		<div class="item-header">
			<h2>${statusIcon} ${data.sourceFile}</h2>
			<div class="meta">
				<span class="badge">${data.extraction.formatType}</span>
				<span class="badge">${Math.round(data.extraction.confidence * 100)}% conf</span>
				<span class="badge">${data.bidders.length} bidders</span>
				<span class="badge">${data.extraction.pagesProcessed} pages</span>
				<span class="badge">${Math.round(data.extraction.processingTimeMs / 1000)}s</span>
			</div>
		</div>
		<div class="item-body">
			<div class="pdf-side">
				${item.thumbnailBase64 ? `<img src="data:image/png;base64,${item.thumbnailBase64}" alt="PDF page 1" />` : "<div class='no-image'>No preview</div>"}
			</div>
			<div class="data-side">
				<div class="project-info">
					<h3>${data.project.name}</h3>
					${data.project.owner ? `<div>Owner: ${data.project.owner}</div>` : ""}
					${data.project.bidDate ? `<div>Bid Date: ${data.project.bidDate}</div>` : ""}
					${data.project.projectId ? `<div>Project ID: ${data.project.projectId}</div>` : ""}
				</div>
				${engineerHtml}
				${warningsHtml}
				<div class="bidders">${biddersHtml}</div>
			</div>
		</div>
	</div>`;
}

function buildHtml(items: ReviewItem[]): string {
	const successCount = items.filter(
		(i) => i.data.extraction.warnings.length === 0,
	).length;
	const warningCount = items.length - successCount;

	const nav = items
		.map((item, i) => {
			const hasWarnings = item.data.extraction.warnings.length > 0;
			return `<a href="#item-${i}" class="${hasWarnings ? "nav-warning" : "nav-success"}">${item.data.sourceFile.replace("Bid_Results_", "").replace(".pdf", "")}</a>`;
		})
		.join("");

	const itemsHtml = items.map((item, i) => renderItem(item, i)).join("");

	return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Bid Extract Review — ${items.length} PDFs</title>
<style>
	* { box-sizing: border-box; margin: 0; padding: 0; }
	body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f5f5f5; color: #333; }
	.header { background: #1a1a2e; color: white; padding: 20px 30px; position: sticky; top: 0; z-index: 100; }
	.header h1 { font-size: 1.4em; }
	.header .stats { margin-top: 8px; font-size: 0.9em; opacity: 0.8; }
	.nav { background: #16213e; padding: 10px 30px; display: flex; flex-wrap: wrap; gap: 4px; position: sticky; top: 68px; z-index: 99; max-height: 120px; overflow-y: auto; }
	.nav a { padding: 3px 8px; border-radius: 4px; text-decoration: none; font-size: 0.75em; }
	.nav-success { background: #d4edda; color: #155724; }
	.nav-warning { background: #fff3cd; color: #856404; }
	.content { padding: 20px 30px; }
	.review-item { background: white; border-radius: 8px; margin-bottom: 24px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); overflow: hidden; }
	.review-item.warning { border-left: 4px solid #ffc107; }
	.review-item.success { border-left: 4px solid #28a745; }
	.item-header { padding: 16px 20px; border-bottom: 1px solid #eee; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px; }
	.item-header h2 { font-size: 1em; }
	.meta { display: flex; gap: 6px; flex-wrap: wrap; }
	.badge { background: #e9ecef; padding: 2px 8px; border-radius: 12px; font-size: 0.75em; }
	.item-body { display: flex; gap: 20px; padding: 20px; }
	.pdf-side { flex: 0 0 45%; max-height: 800px; overflow-y: auto; }
	.pdf-side img { width: 100%; border: 1px solid #ddd; border-radius: 4px; }
	.no-image { height: 200px; display: flex; align-items: center; justify-content: center; background: #f0f0f0; border-radius: 4px; color: #999; }
	.data-side { flex: 1; overflow-x: auto; }
	.project-info { margin-bottom: 12px; }
	.project-info h3 { font-size: 1.1em; margin-bottom: 4px; }
	.engineer { background: #e8f4fd; padding: 8px 12px; border-radius: 4px; margin-bottom: 12px; }
	.warnings { background: #fff3cd; padding: 8px 12px; border-radius: 4px; margin-bottom: 12px; }
	.warnings ul { margin-left: 20px; margin-top: 4px; }
	.bidder { margin-bottom: 16px; padding: 12px; border: 1px solid #eee; border-radius: 4px; }
	.bidder-header { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
	.rank { background: #007bff; color: white; padding: 2px 8px; border-radius: 12px; font-size: 0.8em; }
	.total { margin-left: auto; font-weight: bold; color: #28a745; }
	.detail { font-size: 0.85em; color: #666; margin-bottom: 4px; }
	.line-items { width: 100%; border-collapse: collapse; font-size: 0.85em; margin-top: 8px; }
	.line-items th { background: #f8f9fa; padding: 4px 8px; text-align: left; border-bottom: 2px solid #dee2e6; }
	.line-items td { padding: 4px 8px; border-bottom: 1px solid #eee; }
	@media (max-width: 900px) { .item-body { flex-direction: column; } .pdf-side { flex: none; } }
</style>
</head>
<body>
<div class="header">
	<h1>Bid Extract Review</h1>
	<div class="stats">${items.length} PDFs processed — ${successCount} clean, ${warningCount} with warnings</div>
</div>
<div class="nav">${nav}</div>
<div class="content">${itemsHtml}</div>
</body>
</html>`;
}

export async function generateReport(
	outputDir: string,
	reportPath: string,
): Promise<void> {
	const items = await loadExtractions(outputDir);
	const html = buildHtml(items);
	await writeFile(reportPath, html);
}
