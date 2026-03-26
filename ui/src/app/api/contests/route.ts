import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { NextResponse } from "next/server";

const CONTESTS_DIR = join(process.cwd(), "..", "contests");

export async function GET() {
  const contests: unknown[] = [];
  try {
    const dirs = await readdir(CONTESTS_DIR);
    for (const dir of dirs) {
      const dirPath = join(CONTESTS_DIR, dir);
      const files = await readdir(dirPath);
      for (const file of files) {
        if (!file.endsWith(".json")) continue;
        const content = await readFile(join(dirPath, file), "utf-8");
        contests.push(JSON.parse(content));
      }
    }
  } catch {
    // empty
  }
  return NextResponse.json(contests);
}

export async function POST(req: Request) {
  const body = await req.json();
  const { sourceFile, fieldPath, currentValue, reason, suggestedValue } = body;

  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const contest = {
    id,
    sourceFile,
    fieldPath,
    currentValue,
    suggestedValue,
    reason,
    status: "open",
    createdAt: new Date().toISOString(),
  };

  const safeName = sourceFile
    .replace(/\.pdf$/i, "")
    .replace(/[^a-zA-Z0-9_-]/g, "_");
  const dir = join(CONTESTS_DIR, safeName);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, `${id}.json`), JSON.stringify(contest, null, 2));

  return NextResponse.json(contest);
}
