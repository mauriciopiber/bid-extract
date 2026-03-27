import { NextResponse } from "next/server";
import { execFile } from "node:child_process";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const FILES_DIR = process.env.BID_FILES_DIR || "/Users/mauriciopiber/Projects/edge/bid-extract-files";
const PDF_DIR = `${FILES_DIR}/pdfs`;

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ name: string; page: string }> },
) {
  const { name, page } = await params;
  const pageNum = parseInt(page, 10);
  const pdfPath = join(PDF_DIR, `${name}.pdf`);

  const tempDir = await mkdtemp(join(tmpdir(), "bid-page-"));
  try {
    await execFileAsync("pdftoppm", [
      "-png", "-r", "200",
      "-f", String(pageNum),
      "-l", String(pageNum),
      pdfPath,
      join(tempDir, "page"),
    ]);

    const { readdirSync } = await import("node:fs");
    const files = readdirSync(tempDir).filter((f) => f.endsWith(".png"));
    if (files.length === 0) {
      return NextResponse.json({ error: "Page not found" }, { status: 404 });
    }

    const image = await readFile(join(tempDir, files[0]));
    return new NextResponse(image, {
      headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=3600" },
    });
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}
