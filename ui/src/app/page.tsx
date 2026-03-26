"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

interface ExtractionSummary {
  name: string;
  sourceFile: string;
  project: { name: string; owner?: string; bidDate?: string };
  bidderCount: number;
  formatType: string;
  confidence: number;
  warnings: number;
  processingTimeMs: number;
}

export default function Home() {
  const [extractions, setExtractions] = useState<ExtractionSummary[]>([]);
  const [filter, setFilter] = useState("");

  useEffect(() => {
    fetch("/api/extractions")
      .then((r) => r.json())
      .then(setExtractions);
  }, []);

  const filtered = extractions.filter(
    (e) =>
      e.name.toLowerCase().includes(filter.toLowerCase()) ||
      e.project.name.toLowerCase().includes(filter.toLowerCase()) ||
      e.formatType.includes(filter.toLowerCase())
  );

  const clean = filtered.filter((e) => e.warnings === 0).length;
  const withWarnings = filtered.length - clean;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-gray-900 text-white px-8 py-5">
        <h1 className="text-xl font-bold">Bid Extract Review</h1>
        <p className="text-gray-400 text-sm mt-1">
          {extractions.length} extractions — {clean} clean, {withWarnings} with
          warnings
        </p>
      </header>

      <div className="px-8 py-4">
        <input
          type="text"
          placeholder="Filter by name, project, or format..."
          className="w-full max-w-md px-4 py-2 border border-gray-300 rounded-lg text-sm"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      </div>

      <div className="px-8 pb-8">
        <table className="w-full bg-white rounded-lg shadow-sm overflow-hidden">
          <thead>
            <tr className="bg-gray-100 text-left text-sm text-gray-600">
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Project</th>
              <th className="px-4 py-3">Format</th>
              <th className="px-4 py-3">Bidders</th>
              <th className="px-4 py-3">Confidence</th>
              <th className="px-4 py-3">Warnings</th>
              <th className="px-4 py-3">Time</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((e) => (
              <tr
                key={e.name}
                className="border-t border-gray-100 hover:bg-blue-50 transition-colors"
              >
                <td className="px-4 py-3">
                  {e.warnings === 0 ? "✅" : "⚠️"}
                </td>
                <td className="px-4 py-3">
                  <Link
                    href={`/review/${e.name}`}
                    className="text-blue-600 hover:underline font-medium"
                  >
                    {e.project.name}
                  </Link>
                  <div className="text-xs text-gray-400">
                    {e.project.owner}
                    {e.project.bidDate ? ` — ${e.project.bidDate}` : ""}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span className="px-2 py-1 bg-gray-100 rounded text-xs">
                    {e.formatType}
                  </span>
                </td>
                <td className="px-4 py-3 text-center">{e.bidderCount}</td>
                <td className="px-4 py-3">
                  {Math.round(e.confidence * 100)}%
                </td>
                <td className="px-4 py-3 text-center">
                  {e.warnings > 0 && (
                    <span className="px-2 py-1 bg-yellow-100 text-yellow-800 rounded text-xs">
                      {e.warnings}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-sm text-gray-500">
                  {(e.processingTimeMs / 1000).toFixed(1)}s
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
