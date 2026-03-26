import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "../../../../../lib/db";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ name: string }> },
) {
  const { name } = await params;
  const extractionId = parseInt(name, 10);

  if (isNaN(extractionId)) {
    return NextResponse.json({ error: "ID required" }, { status: 400 });
  }

  const pages = await db
    .select()
    .from(schema.pageExtractions)
    .where(eq(schema.pageExtractions.extractionId, extractionId));

  return NextResponse.json(
    pages
      .sort((a, b) => a.pageNumber - b.pageNumber)
      .map((p) => ({
        pageNumber: p.pageNumber,
        pageType: p.pageType,
        confidence: p.confidence,
        data: p.resultJson,
        notes: p.notes,
      })),
  );
}
