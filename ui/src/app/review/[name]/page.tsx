"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

interface PageData {
  pageNumber: number;
  pageType: string;
  confidence: number | null;
  data: Record<string, unknown>;
  notes: string | null;
}

interface ExtractionMeta {
  id: number;
  layoutId: number | null;
  warningCount: number | null;
  processingTimeMs: number | null;
}

interface EvalData {
  mathScore: number | null;
  completenessScore: number | null;
  overallScore: number | null;
}

interface LogEntry {
  step: string;
  level: string;
  message: string;
}

function formatMoney(n: unknown) {
  if (n == null || typeof n !== "number") return "\u2014";
  return "$" + n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function PageCard({
  page,
  pdfName,
  extractionId,
}: {
  page: PageData;
  pdfName: string;
  extractionId: number;
}) {
  return (
    <div className="bg-white rounded-lg shadow-sm mb-6 overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3 bg-gray-50 border-b">
        <span className="font-bold text-sm">Page {page.pageNumber}</span>
        <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-xs font-medium">
          {page.pageType}
        </span>
        {page.confidence != null && (
          <span className="text-xs text-gray-400">
            {Math.round(page.confidence * 100)}%
          </span>
        )}
        {page.notes && (
          <span className="text-xs text-gray-400 ml-auto truncate max-w-md">
            {page.notes}
          </span>
        )}
      </div>

      <div className="flex" style={{ height: 700 }}>
        {/* Left: PDF page image */}
        <div className="w-1/2 border-r border-gray-200 overflow-auto bg-gray-100">
          <iframe
            src={`/api/pdf/${pdfName}#page=${page.pageNumber}`}
            className="w-full h-full"
            title={`Page ${page.pageNumber}`}
          />
        </div>

        {/* Right: Extracted data — independent scroll */}
        <div className="w-1/2 overflow-y-auto p-4">
          <PageDataView page={page} />
        </div>
      </div>
    </div>
  );
}

function PageDataView({ page }: { page: PageData }) {
  const d = page.data;

  if (page.pageType === "bid_ranking") {
    return <BidRankingView data={d} />;
  }
  if (page.pageType === "bid_tabulation") {
    return <BidTabulationView data={d} />;
  }
  if (page.pageType === "cover") {
    return <CoverView data={d} />;
  }
  if (page.pageType === "summary") {
    return <SummaryView data={d} />;
  }

  // Generic fallback
  return (
    <pre className="text-xs bg-gray-50 p-3 rounded overflow-auto">
      {JSON.stringify(d, null, 2)}
    </pre>
  );
}

function BidRankingView({ data }: { data: Record<string, unknown> }) {
  const bidders = (data.bidders as { rank: number; name: string; totalBaseBid?: number }[]) ?? [];
  const project = data.project as Record<string, string> | undefined;

  return (
    <div>
      {project?.name && (
        <div className="mb-3">
          <div className="font-bold">{project.name}</div>
          {project.owner && <div className="text-sm text-gray-500">{project.owner}</div>}
          {project.bidDate && <div className="text-sm text-gray-500">{project.bidDate}</div>}
        </div>
      )}
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="bg-gray-50 text-left text-xs text-gray-500">
            <th className="px-3 py-2">Rank</th>
            <th className="px-3 py-2">Bidder</th>
            <th className="px-3 py-2 text-right">Total</th>
          </tr>
        </thead>
        <tbody>
          {bidders.map((b, i) => (
            <tr key={i} className="border-t border-gray-100">
              <td className="px-3 py-2">
                <span className="bg-blue-600 text-white px-2 py-0.5 rounded-full text-xs">
                  #{b.rank}
                </span>
              </td>
              <td className="px-3 py-2 font-medium">{b.name}</td>
              <td className="px-3 py-2 text-right text-green-600 font-bold">
                {formatMoney(b.totalBaseBid)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function BidTabulationView({ data }: { data: Record<string, unknown> }) {
  const sections = (data.sections as { name?: string; items?: Record<string, unknown>[] }[]) ?? [];

  return (
    <div>
      {sections.map((section, si) => (
        <div key={si} className="mb-4">
          {section.name && (
            <div className="font-bold text-sm mb-2 text-gray-700">
              {section.name}
            </div>
          )}
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-gray-50 text-left text-gray-500">
                <th className="px-2 py-1">#</th>
                <th className="px-2 py-1">Description</th>
                <th className="px-2 py-1">Unit</th>
                <th className="px-2 py-1 text-right">Qty</th>
                <th className="px-2 py-1 text-right">Eng. Est.</th>
                <th className="px-2 py-1 text-right">Bids</th>
              </tr>
            </thead>
            <tbody>
              {(section.items ?? []).map((item, ii) => {
                const bids = item.bids as Record<string, { unitPrice?: number; extendedPrice?: number }> | undefined;
                const engEst = item.engineerEstimate as { unitPrice?: number; extendedPrice?: number } | undefined;
                return (
                  <tr key={ii} className="border-t border-gray-100">
                    <td className="px-2 py-1">{String(item.itemNo ?? "")}</td>
                    <td className="px-2 py-1">{String(item.description ?? "")}</td>
                    <td className="px-2 py-1">{String(item.unit ?? "")}</td>
                    <td className="px-2 py-1 text-right">{item.quantity != null ? String(item.quantity) : ""}</td>
                    <td className="px-2 py-1 text-right text-gray-500">
                      {engEst ? formatMoney(engEst.extendedPrice) : ""}
                    </td>
                    <td className="px-2 py-1 text-right">
                      {bids && typeof bids === "object" && !Array.isArray(bids)
                        ? Object.entries(bids).map(([name, bid]) => (
                          <div key={name} className="text-xs">
                            <span className="text-gray-400">{name}: </span>
                            {formatMoney(bid.extendedPrice)}
                          </div>
                        ))
                        : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ))}
      {sections.length === 0 && (
        <pre className="text-xs bg-gray-50 p-3 rounded overflow-auto">
          {JSON.stringify(data, null, 2)}
        </pre>
      )}
    </div>
  );
}

function CoverView({ data }: { data: Record<string, unknown> }) {
  const project = data.project as Record<string, string> | undefined;
  return (
    <div className="space-y-1 text-sm">
      {project && Object.entries(project).map(([k, v]) => (
        <div key={k}>
          <strong className="capitalize">{k}:</strong> {v}
        </div>
      ))}
      {data.engineer && <div><strong>Engineer:</strong> {String(data.engineer)}</div>}
      {Array.isArray(data.contracts) && data.contracts.length > 0 && (
        <div><strong>Contracts:</strong> {data.contracts.join(", ")}</div>
      )}
    </div>
  );
}

function SummaryView({ data }: { data: Record<string, unknown> }) {
  return (
    <div className="space-y-2 text-sm">
      {data.lowBidder && <div><strong>Low Bidder:</strong> {String(data.lowBidder)}</div>}
      {data.engineerEstimate && <div><strong>Engineer Est:</strong> {formatMoney(data.engineerEstimate)}</div>}
      {Array.isArray(data.totalBids) && (
        <div>
          {(data.totalBids as { bidder: string; total: number }[]).map((b, i) => (
            <div key={i}>{b.bidder}: {formatMoney(b.total)}</div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ReviewPage() {
  const params = useParams();
  const name = params.name as string;
  const [pages, setPages] = useState<PageData[]>([]);
  const [meta, setMeta] = useState<ExtractionMeta | null>(null);
  const [evalData, setEvalData] = useState<EvalData | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [sourceFile, setSourceFile] = useState("");

  useEffect(() => {
    // Load per-page data
    fetch(`/api/extractions/${name}/pages`)
      .then((r) => r.json())
      .then(setPages);

    // Load extraction metadata
    fetch(`/api/extractions/${name}`)
      .then((r) => r.json())
      .then((d) => {
        setMeta(d._extraction);
        setEvalData(d._eval);
        setLogs(d._logs ?? []);
        setSourceFile(d.sourceFile ?? "");
      });
  }, [name]);

  const pdfName = sourceFile.replace(".pdf", "");

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-gray-900 text-white px-8 py-4 flex items-center gap-4">
        <Link href="/" className="text-gray-400 hover:text-white text-sm">
          &larr; Back
        </Link>
        <h1 className="text-lg font-bold">
          Extraction #{name}
        </h1>
        {evalData && (
          <div className="flex gap-2 ml-auto text-xs">
            <span className="px-2 py-1 bg-gray-700 rounded">
              math: {evalData.mathScore}%
            </span>
            <span className="px-2 py-1 bg-gray-700 rounded">
              complete: {evalData.completenessScore}%
            </span>
            <span className={`px-2 py-1 rounded font-bold ${
              (evalData.overallScore ?? 0) >= 90 ? "bg-green-700" : "bg-yellow-700"
            }`}>
              {evalData.overallScore}%
            </span>
          </div>
        )}
      </header>

      {/* Pipeline steps */}
      {logs.length > 0 && (
        <div className="px-8 py-2 bg-gray-100 border-b text-xs text-gray-500 flex gap-3 overflow-x-auto">
          {logs.map((l, i) => (
            <span key={i} className={l.level === "error" ? "text-red-500" : ""}>
              [{l.step}] {l.message}
            </span>
          ))}
        </div>
      )}

      {/* Page-by-page review */}
      <div className="px-8 py-6">
        {pages.map((page) => (
          <PageCard
            key={page.pageNumber}
            page={page}
            pdfName={pdfName}
            extractionId={parseInt(name, 10)}
          />
        ))}

        {pages.length === 0 && (
          <div className="text-center text-gray-400 py-12">
            Loading pages...
          </div>
        )}
      </div>
    </div>
  );
}
