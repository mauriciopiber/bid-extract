import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { NextResponse } from "next/server";

const OUTPUT_DIR = join(process.cwd(), "..", "output");

export async function GET() {
  try {
    const files = await readdir(OUTPUT_DIR);
    const jsonFiles = files.filter((f) => f.endsWith(".json")).sort();

    const extractions = await Promise.all(
      jsonFiles.map(async (file) => {
        const content = await readFile(join(OUTPUT_DIR, file), "utf-8");
        const data = JSON.parse(content);
        return {
          name: file.replace(".json", ""),
          file,
          sourceFile: data.sourceFile,
          project: data.project,
          bidderCount: data.bidders?.length ?? 0,
          formatType: data.extraction?.formatType,
          confidence: data.extraction?.confidence,
          warnings: data.extraction?.warnings?.length ?? 0,
          processingTimeMs: data.extraction?.processingTimeMs,
        };
      })
    );

    return NextResponse.json(extractions);
  } catch {
    return NextResponse.json([]);
  }
}
