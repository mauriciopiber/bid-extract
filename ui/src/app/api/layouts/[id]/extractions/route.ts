import { NextResponse } from "next/server";
import { eq, desc } from "drizzle-orm";
import { db, schema } from "../../../../../lib/db";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const layoutId = parseInt(id, 10);

  const extractions = await db
    .select()
    .from(schema.extractions)
    .where(eq(schema.extractions.layoutId, layoutId))
    .orderBy(desc(schema.extractions.createdAt));

  const evals = await db
    .select()
    .from(schema.evals)
    .where(eq(schema.evals.layoutId, layoutId));

  const result = extractions.map((e) => {
    const evalResult = evals.find((ev) => ev.extractionId === e.id);
    return {
      id: e.id,
      pdfFile: e.pdfFile,
      bidderCount: e.bidderCount,
      lineItemCount: e.lineItemCount,
      warningCount: e.warningCount,
      errorCount: e.errorCount,
      mathCorrections: e.mathCorrections,
      llmCorrections: e.llmCorrections,
      processingTimeMs: e.processingTimeMs,
      mathScore: evalResult?.mathScore,
      completenessScore: evalResult?.completenessScore,
      overallScore: evalResult?.overallScore,
      createdAt: e.createdAt,
    };
  });

  return NextResponse.json(result);
}
