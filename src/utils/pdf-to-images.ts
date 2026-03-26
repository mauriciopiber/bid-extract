/**
 * Convert PDF pages to images for vision-based processing.
 * Uses pdftoppm (poppler) to render each page as a PNG buffer.
 */

import { execFile } from "node:child_process";
import { readdir, readFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface PdfPage {
	pageNumber: number;
	image: Buffer;
}

export async function pdfToImages(
	pdfPath: string,
	dpi = 200,
): Promise<PdfPage[]> {
	const tempDir = await mkdtemp(join(tmpdir(), "bid-extract-"));

	try {
		const outputPrefix = join(tempDir, "page");

		await execFileAsync("pdftoppm", [
			"-png",
			"-r",
			String(dpi),
			pdfPath,
			outputPrefix,
		]);

		const files = await readdir(tempDir);
		const pngFiles = files.filter((f) => f.endsWith(".png")).sort();

		const pages: PdfPage[] = [];
		for (let i = 0; i < pngFiles.length; i++) {
			const image = await readFile(join(tempDir, pngFiles[i]));
			pages.push({ pageNumber: i + 1, image });
		}

		return pages;
	} finally {
		await rm(tempDir, { recursive: true, force: true });
	}
}
