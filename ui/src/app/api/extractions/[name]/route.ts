import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { NextResponse } from "next/server";

const OUTPUT_DIR = join(process.cwd(), "..", "output");

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ name: string }> }
) {
  const { name } = await params;
  try {
    const content = await readFile(join(OUTPUT_DIR, `${name}.json`), "utf-8");
    return NextResponse.json(JSON.parse(content));
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
