"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

interface Layout {
  id: number;
  fingerprint: string;
  name: string;
  formatType: string;
  status: string;
  sampleCount: number;
  avgScore: number | null;
  extractionCount: number;
  cleanCount: number;
}

const STATUS_COLORS: Record<string, string> = {
  discovered: "bg-gray-100 text-gray-700",
  extracting: "bg-blue-100 text-blue-700",
  validating: "bg-yellow-100 text-yellow-700",
  contesting: "bg-red-100 text-red-700",
  evolving: "bg-purple-100 text-purple-700",
  stable: "bg-green-100 text-green-700",
};

export default function Home() {
  const [layouts, setLayouts] = useState<Layout[]>([]);

  useEffect(() => {
    fetch("/api/layouts")
      .then((r) => r.json())
      .then(setLayouts);
  }, []);

  const totalExtractions = layouts.reduce(
    (s, l) => s + l.extractionCount,
    0,
  );
  const totalClean = layouts.reduce((s, l) => s + l.cleanCount, 0);

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-gray-900 text-white px-8 py-5">
        <h1 className="text-xl font-bold">Bid Extract</h1>
        <p className="text-gray-400 text-sm mt-1">
          {layouts.length} layouts — {totalExtractions} extractions —{" "}
          {totalClean} clean
        </p>
      </header>

      <div className="px-8 py-6">
        <div className="grid gap-4">
          {layouts.map((l) => (
            <Link
              key={l.id}
              href={`/layout-view/${l.id}`}
              className="block bg-white rounded-lg shadow-sm p-5 hover:shadow-md transition-shadow border-l-4"
              style={{
                borderLeftColor:
                  l.status === "stable"
                    ? "#22c55e"
                    : l.status === "contesting"
                      ? "#ef4444"
                      : "#6b7280",
              }}
            >
              <div className="flex items-center gap-4">
                <div className="flex-1">
                  <div className="font-bold text-gray-900">{l.name}</div>
                  <div className="text-xs text-gray-400 mt-1 font-mono">
                    {l.fingerprint}
                  </div>
                </div>

                <span
                  className={`px-2 py-1 rounded text-xs font-medium ${STATUS_COLORS[l.status] ?? "bg-gray-100"}`}
                >
                  {l.status}
                </span>

                <div className="text-right text-sm">
                  <div className="text-gray-600">
                    {l.extractionCount} extractions
                  </div>
                  <div className="text-gray-400">
                    {l.cleanCount}/{l.extractionCount} clean
                  </div>
                </div>

                {l.avgScore != null && (
                  <div
                    className={`text-2xl font-bold ${
                      l.avgScore >= 90
                        ? "text-green-600"
                        : l.avgScore >= 70
                          ? "text-yellow-600"
                          : "text-red-600"
                    }`}
                  >
                    {l.avgScore}
                  </div>
                )}
              </div>
            </Link>
          ))}

          {layouts.length === 0 && (
            <div className="text-center text-gray-400 py-12">
              No layouts yet. Run{" "}
              <code className="bg-gray-100 px-2 py-1 rounded text-sm">
                pnpm cli extract &lt;pdf&gt;
              </code>{" "}
              to start.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
