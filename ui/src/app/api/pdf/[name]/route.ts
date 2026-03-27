import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { NextResponse } from "next/server";

const FILES_DIR = process.env.BID_FILES_DIR || "/Users/mauriciopiber/Projects/edge/bid-extract-files";
const PDF_DIR = `${FILES_DIR}/pdfs`;

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ name: string }> }
) {
  const { name } = await params;
  try {
    const pdfBuffer = await readFile(join(PDF_DIR, `${name}.pdf`));
    return new NextResponse(pdfBuffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${name}.pdf"`,
      },
    });
  } catch {
    return NextResponse.json({ error: "PDF not found" }, { status: 404 });
  }
}
