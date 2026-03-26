import { NextResponse } from "next/server";
import { db, schema } from "../../../lib/db";

export async function GET() {
  const layouts = await db.select().from(schema.layouts);
  const evals = await db.select().from(schema.evals);
  const extractions = await db.select().from(schema.extractions);

  const result = layouts.map((l) => {
    const layoutExtractions = extractions.filter((e) => e.layoutId === l.id);
    const layoutEvals = evals.filter((e) => e.layoutId === l.id);
    const avgScore =
      layoutEvals.length > 0
        ? Math.round(
            layoutEvals.reduce((s, e) => s + (e.overallScore ?? 0), 0) /
              layoutEvals.length,
          )
        : null;

    return {
      id: l.id,
      fingerprint: l.fingerprint,
      name: l.name,
      formatType: l.formatType,
      status: l.status,
      sampleCount: l.sampleCount,
      structure: l.structure,
      avgScore,
      extractionCount: layoutExtractions.length,
      cleanCount: layoutExtractions.filter(
        (e) => (e.warningCount ?? 0) === 0 && (e.errorCount ?? 0) === 0,
      ).length,
    };
  });

  return NextResponse.json(result);
}
