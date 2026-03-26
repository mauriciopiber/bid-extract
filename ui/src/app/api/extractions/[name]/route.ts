import { NextResponse } from "next/server";
import { eq, desc } from "drizzle-orm";
import { db, schema } from "../../../../lib/db";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ name: string }> },
) {
  const { name } = await params;

  const isId = /^\d+$/.test(name);

  let extraction;
  if (isId) {
    const results = await db
      .select()
      .from(schema.extractions)
      .where(eq(schema.extractions.id, parseInt(name, 10)));
    extraction = results[0];
  } else {
    const pdfFile = name.endsWith(".pdf") ? name : `${name}.pdf`;
    const results = await db
      .select()
      .from(schema.extractions)
      .where(eq(schema.extractions.pdfFile, pdfFile))
      .orderBy(desc(schema.extractions.createdAt))
      .limit(1);
    extraction = results[0];
  }

  if (!extraction) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const logs = await db
    .select()
    .from(schema.runLogs)
    .where(eq(schema.runLogs.extractionId, extraction.id));

  const evals = await db
    .select()
    .from(schema.evals)
    .where(eq(schema.evals.extractionId, extraction.id));

  return NextResponse.json({
    ...(extraction.resultJson as object),
    _extraction: {
      id: extraction.id,
      layoutId: extraction.layoutId,
      warningCount: extraction.warningCount,
      errorCount: extraction.errorCount,
      mathCorrections: extraction.mathCorrections,
      llmCorrections: extraction.llmCorrections,
      processingTimeMs: extraction.processingTimeMs,
    },
    _eval: evals[0] ?? null,
    _logs: logs.map((l) => ({
      step: l.step,
      level: l.level,
      message: l.message,
    })),
  });
}
