/**
 * Convert PDF pages to images for vision-based processing.
 *
 * Uses sharp or pdf-poppler to render each page as a PNG buffer.
 */

export interface PdfPage {
	pageNumber: number;
	image: Buffer;
}

export async function pdfToImages(pdfPath: string): Promise<PdfPage[]> {
	// TODO: Implement PDF → image conversion
	// Options: pdf-poppler, pdf2pic, or shell out to pdftoppm
	throw new Error("Not implemented");
}
