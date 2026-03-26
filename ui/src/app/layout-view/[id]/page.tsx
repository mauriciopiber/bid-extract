"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

interface Extraction {
  id: number;
  pdfFile: string;
  bidderCount: number | null;
  lineItemCount: number | null;
  warningCount: number | null;
  errorCount: number | null;
  mathCorrections: number | null;
  llmCorrections: number | null;
  processingTimeMs: number | null;
  mathScore: number | null;
  completenessScore: number | null;
  overallScore: number | null;
  createdAt: string;
}

interface Layout {
  id: number;
  fingerprint: string;
  name: string;
  formatType: string;
  status: string;
  sampleCount: number;
}

export default function LayoutPage() {
  const params = useParams();
  const id = params.id as string;
  const [extractions, setExtractions] = useState<Extraction[]>([]);
  const [layouts, setLayouts] = useState<Layout[]>([]);

  useEffect(() => {
    fetch(`/api/layouts/${id}/extractions`).then((r) =>
      r.json().then(setExtractions),
    );
    fetch("/api/layouts").then((r) =>
      r.json().then(setLayouts),
    );
  }, [id]);

  const layout = layouts.find((l) => l.id === parseInt(id, 10));

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-gray-900 text-white px-8 py-4 flex items-center gap-4">
        <Link href="/" className="text-gray-400 hover:text-white text-sm">
          &larr; Layouts
        </Link>
        <h1 className="text-lg font-bold">
          {layout?.name ?? `Layout #${id}`}
        </h1>
        {layout && (
          <div className="flex gap-2 ml-auto text-xs">
            <span className="px-2 py-1 bg-gray-700 rounded">
              {layout.formatType}
            </span>
            <span className="px-2 py-1 bg-gray-700 rounded">
              {layout.status}
            </span>
            <span className="px-2 py-1 bg-gray-700 rounded">
              {layout.sampleCount} samples
            </span>
          </div>
        )}
      </header>

      {layout && (
        <div className="px-8 py-2 bg-gray-100 text-xs text-gray-500 font-mono border-b">
          {layout.fingerprint}
        </div>
      )}

      <div className="px-8 py-6">
        <table className="w-full bg-white rounded-lg shadow-sm overflow-hidden">
          <thead>
            <tr className="bg-gray-100 text-left text-sm text-gray-600">
              <th className="px-4 py-3">ID</th>
              <th className="px-4 py-3">PDF</th>
              <th className="px-4 py-3 text-center">Bidders</th>
              <th className="px-4 py-3 text-center">Items</th>
              <th className="px-4 py-3 text-center">Math</th>
              <th className="px-4 py-3 text-center">Complete</th>
              <th className="px-4 py-3 text-center">Score</th>
              <th className="px-4 py-3 text-center">Warnings</th>
              <th className="px-4 py-3 text-center">Corrections</th>
              <th className="px-4 py-3 text-right">Time</th>
            </tr>
          </thead>
          <tbody>
            {extractions.map((e) => {
              const pdfName = e.pdfFile.replace(".pdf", "");
              const scoreColor =
                (e.overallScore ?? 0) >= 90
                  ? "text-green-600"
                  : (e.overallScore ?? 0) >= 70
                    ? "text-yellow-600"
                    : "text-red-600";

              return (
                <tr
                  key={e.id}
                  className="border-t border-gray-100 hover:bg-blue-50 transition-colors"
                >
                  <td className="px-4 py-3 text-sm text-gray-400">#{e.id}</td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/review/${e.id}`}
                      className="text-blue-600 hover:underline font-medium text-sm"
                    >
                      {pdfName.replace("Bid_Results_", "")}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-center text-sm">
                    {e.bidderCount ?? 0}
                  </td>
                  <td className="px-4 py-3 text-center text-sm">
                    {e.lineItemCount ?? 0}
                  </td>
                  <td className="px-4 py-3 text-center text-sm">
                    {e.mathScore != null ? `${e.mathScore}%` : "—"}
                  </td>
                  <td className="px-4 py-3 text-center text-sm">
                    {e.completenessScore != null
                      ? `${e.completenessScore}%`
                      : "—"}
                  </td>
                  <td
                    className={`px-4 py-3 text-center text-sm font-bold ${scoreColor}`}
                  >
                    {e.overallScore != null ? e.overallScore : "—"}
                  </td>
                  <td className="px-4 py-3 text-center text-sm">
                    {(e.warningCount ?? 0) > 0 && (
                      <span className="px-2 py-1 bg-yellow-100 text-yellow-800 rounded text-xs">
                        {e.warningCount}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center text-sm text-gray-500">
                    {(e.mathCorrections ?? 0) + (e.llmCorrections ?? 0) > 0
                      ? `${e.mathCorrections ?? 0}m + ${e.llmCorrections ?? 0}l`
                      : "—"}
                  </td>
                  <td className="px-4 py-3 text-right text-sm text-gray-500">
                    {((e.processingTimeMs ?? 0) / 1000).toFixed(1)}s
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {extractions.length === 0 && (
          <div className="text-center text-gray-400 py-12">
            No extractions for this layout yet.
          </div>
        )}
      </div>
    </div>
  );
}
