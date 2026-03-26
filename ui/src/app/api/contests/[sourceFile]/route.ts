import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { NextResponse } from "next/server";

const CONTESTS_DIR = join(process.cwd(), "..", "contests");

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ sourceFile: string }> }
) {
  const { sourceFile } = await params;
  const safeName = sourceFile.replace(/[^a-zA-Z0-9_-]/g, "_");
  const dir = join(CONTESTS_DIR, safeName);
  const contests: unknown[] = [];

  try {
    const files = await readdir(dir);
    for (const file of files) {
      if (!file.endsWith(".json")) continue;
      const content = await readFile(join(dir, file), "utf-8");
      contests.push(JSON.parse(content));
    }
  } catch {
    // empty
  }

  return NextResponse.json(contests);
}
