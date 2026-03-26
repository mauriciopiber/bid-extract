import { NextResponse } from "next/server";
import { desc } from "drizzle-orm";
import { db, schema } from "../../../lib/db";

export async function GET() {
  const extractions = await db
    .select()
    .from(schema.extractions)
    .orderBy(desc(schema.extractions.createdAt))
    .limit(50);

  return NextResponse.json(
    extractions.map((e) => ({
      id: e.id,
      name: e.pdfFile.replace(".pdf", ""),
      file: e.pdfFile,
      layoutId: e.layoutId,
      bidderCount: e.bidderCount ?? 0,
      lineItemCount: e.lineItemCount ?? 0,
      warningCount: e.warningCount ?? 0,
      processingTimeMs: e.processingTimeMs ?? 0,
    })),
  );
}
