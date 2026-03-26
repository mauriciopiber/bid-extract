"use client";

import Link from "next/link";
import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";

interface LineItem {
  itemNo: string | number;
  description: string;
  unit?: string;
  quantity?: number;
  unitPrice?: number;
  extendedPrice?: number;
}

interface Bidder {
  rank: number;
  name: string;
  address?: string;
  phone?: string;
  totalBaseBid?: number;
  totalBid?: number;
  lineItems?: LineItem[];
  alternates?: { name: string; total?: number; lineItems?: LineItem[] }[];
}

interface BidTabulation {
  sourceFile: string;
  project: {
    name: string;
    projectId?: string;
    owner?: string;
    bidDate?: string;
    location?: string;
    description?: string;
  };
  engineerEstimate?: { total: number; lineItems?: LineItem[] };
  bidders: Bidder[];
  extraction: {
    formatType: string;
    confidence: number;
    pagesProcessed: number;
    warnings: string[];
    processingTimeMs: number;
  };
}

interface Contest {
  id: string;
  sourceFile: string;
  fieldPath: string;
  currentValue: unknown;
  suggestedValue?: unknown;
  reason: string;
  status: string;
  createdAt: string;
}

function formatMoney(n: number | undefined) {
  if (n == null) return "\u2014";
  return (
    "$" +
    n.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  );
}


function ContestButton({
  sourceFile,
  fieldPath,
  currentValue,
  onContested,
}: {
  sourceFile: string;
  fieldPath: string;
  currentValue: unknown;
  onContested: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [suggested, setSuggested] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    setSubmitting(true);
    await fetch("/api/contests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sourceFile,
        fieldPath,
        currentValue,
        reason,
        suggestedValue: suggested || undefined,
      }),
    });
    setOpen(false);
    setReason("");
    setSuggested("");
    setSubmitting(false);
    onContested();
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-red-400 hover:text-red-600 text-xs ml-1 opacity-0 group-hover:opacity-100 transition-opacity"
        title="Contest this value"
      >
        ?
      </button>
    );
  }

  return (
    <div className="absolute right-0 top-full mt-1 z-50 bg-white border border-gray-300 rounded-lg shadow-lg p-3 w-72">
      <div className="text-xs font-bold mb-2 text-gray-700">
        Contest: {fieldPath}
      </div>
      <div className="text-xs text-gray-500 mb-2">
        Current: {JSON.stringify(currentValue)}
      </div>
      <input
        type="text"
        placeholder="What should it be? (optional)"
        className="w-full text-xs border px-2 py-1 rounded mb-2"
        value={suggested}
        onChange={(e) => setSuggested(e.target.value)}
      />
      <input
        type="text"
        placeholder="Why is it wrong?"
        className="w-full text-xs border px-2 py-1 rounded mb-2"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
      />
      <div className="flex gap-2">
        <button
          onClick={submit}
          disabled={!reason || submitting}
          className="text-xs bg-red-500 text-white px-3 py-1 rounded disabled:opacity-50"
        >
          {submitting ? "..." : "Contest"}
        </button>
        <button
          onClick={() => setOpen(false)}
          className="text-xs text-gray-500 px-3 py-1"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function ContestableValue({
  value,
  formatted,
  sourceFile,
  fieldPath,
  onContested,
  className,
}: {
  value: unknown;
  formatted: string;
  sourceFile: string;
  fieldPath: string;
  onContested: () => void;
  className?: string;
}) {
  return (
    <span className={`group relative inline-flex items-center ${className || ""}`}>
      {formatted}
      <ContestButton
        sourceFile={sourceFile}
        fieldPath={fieldPath}
        currentValue={value}
        onContested={onContested}
      />
    </span>
  );
}

function LineItemsTable({
  items,
  sourceFile,
  pathPrefix,
  onContested,
}: {
  items: LineItem[];
  sourceFile: string;
  pathPrefix: string;
  onContested: () => void;
}) {
  return (
    <table className="w-full text-sm border-collapse mt-2">
      <thead>
        <tr className="bg-gray-50 text-left text-xs text-gray-500">
          <th className="px-2 py-1">#</th>
          <th className="px-2 py-1">Description</th>
          <th className="px-2 py-1">Unit</th>
          <th className="px-2 py-1 text-right">Qty</th>
          <th className="px-2 py-1 text-right">Unit Price</th>
          <th className="px-2 py-1 text-right">Extended</th>
        </tr>
      </thead>
      <tbody>
        {items.map((li, i) => {
          const mathCheck =
            li.unitPrice != null &&
            li.quantity != null &&
            li.extendedPrice != null
              ? Math.abs(li.unitPrice * li.quantity - li.extendedPrice) > 0.01
              : false;
          const p = `${pathPrefix}.${i}`;
          return (
            <tr
              key={i}
              className={`border-t border-gray-100 ${mathCheck ? "bg-red-50" : ""}`}
            >
              <td className="px-2 py-1">{li.itemNo}</td>
              <td className="px-2 py-1">{li.description}</td>
              <td className="px-2 py-1">{li.unit || ""}</td>
              <td className="px-2 py-1 text-right">
                <ContestableValue
                  value={li.quantity}
                  formatted={String(li.quantity ?? "")}
                  sourceFile={sourceFile}
                  fieldPath={`${p}.quantity`}
                  onContested={onContested}
                />
              </td>
              <td className="px-2 py-1 text-right">
                <ContestableValue
                  value={li.unitPrice}
                  formatted={formatMoney(li.unitPrice)}
                  sourceFile={sourceFile}
                  fieldPath={`${p}.unitPrice`}
                  onContested={onContested}
                />
              </td>
              <td className="px-2 py-1 text-right">
                <ContestableValue
                  value={li.extendedPrice}
                  formatted={formatMoney(li.extendedPrice)}
                  sourceFile={sourceFile}
                  fieldPath={`${p}.extendedPrice`}
                  onContested={onContested}
                  className={mathCheck ? "text-red-600" : ""}
                />
                {mathCheck && (
                  <span
                    className="ml-1 text-red-500 text-xs"
                    title="Math mismatch"
                  >
                    !
                  </span>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export default function ReviewPage() {
  const params = useParams();
  const name = params.name as string;
  const [data, setData] = useState<BidTabulation | null>(null);
  const [contests, setContests] = useState<Contest[]>([]);
  const [error, setError] = useState("");

  const loadContests = useCallback(() => {
    fetch(`/api/contests/${name}`)
      .then((r) => r.json())
      .then(setContests)
      .catch(() => {});
  }, [name]);

  useEffect(() => {
    fetch(`/api/extractions/${name}`)
      .then((r) => {
        if (!r.ok) throw new Error("Not found");
        return r.json();
      })
      .then(setData)
      .catch((e) => setError(e.message));

    loadContests();
  }, [name, loadContests]);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-red-500">Error: {error}</div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-400">Loading...</div>
      </div>
    );
  }

  const pdfName = data.sourceFile.replace(".pdf", "");
  const openContests = contests.filter((c) => c.status === "open");

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-gray-900 text-white px-8 py-4 flex items-center gap-4">
        <Link href="/" className="text-gray-400 hover:text-white text-sm">
          &larr; Back
        </Link>
        <h1 className="text-lg font-bold">{data.project.name}</h1>
        <div className="flex gap-2 ml-auto">
          <span className="px-2 py-1 bg-gray-700 rounded text-xs">
            {data.extraction.formatType}
          </span>
          <span className="px-2 py-1 bg-gray-700 rounded text-xs">
            {Math.round(data.extraction.confidence * 100)}%
          </span>
          <span className="px-2 py-1 bg-gray-700 rounded text-xs">
            {data.extraction.pagesProcessed} pages
          </span>
          {openContests.length > 0 && (
            <span className="px-2 py-1 bg-red-600 rounded text-xs">
              {openContests.length} contested
            </span>
          )}
        </div>
      </header>

      {/* Contest banner */}
      {openContests.length > 0 && (
        <div className="bg-red-50 px-8 py-3 border-b border-red-200">
          <div className="text-sm font-bold text-red-700 mb-1">
            Open Contests ({openContests.length})
          </div>
          <div className="text-xs text-red-600">
            Run <code className="bg-red-100 px-1 rounded">pnpm cli resolve-contests</code> to fix these
          </div>
          <ul className="mt-2 space-y-1">
            {openContests.map((c) => (
              <li key={c.id} className="text-xs text-red-800">
                <strong>{c.fieldPath}</strong>: {c.reason}
                {c.suggestedValue != null && (
                  <span className="text-red-500">
                    {" "}(suggested: {JSON.stringify(c.suggestedValue)})
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="bg-blue-50 px-8 py-2 text-xs text-blue-600 border-b border-blue-100">
        Hover over any value and click <strong>?</strong> to contest it
      </div>

      <div className="flex h-[calc(100vh-140px)]">
        {/* Left: PDF */}
        <div className="w-1/2 border-r border-gray-200 overflow-auto">
          <iframe
            src={`/api/pdf/${pdfName}`}
            className="w-full h-full"
            title="Source PDF"
          />
        </div>

        {/* Right: Extracted Data */}
        <div className="w-1/2 overflow-auto p-6">
          {/* Project Info */}
          <section className="mb-6">
            <h2 className="text-lg font-bold mb-2">Project</h2>
            <div className="bg-white rounded-lg p-4 shadow-sm text-sm space-y-1">
              <div>
                <strong>Name:</strong> {data.project.name}
              </div>
              {data.project.projectId && (
                <div>
                  <strong>ID:</strong> {data.project.projectId}
                </div>
              )}
              {data.project.owner && (
                <div>
                  <strong>Owner:</strong> {data.project.owner}
                </div>
              )}
              {data.project.bidDate && (
                <div>
                  <strong>Bid Date:</strong> {data.project.bidDate}
                </div>
              )}
              {data.project.location && (
                <div>
                  <strong>Location:</strong> {data.project.location}
                </div>
              )}
              {data.project.description && (
                <div>
                  <strong>Description:</strong> {data.project.description}
                </div>
              )}
            </div>
          </section>

          {/* Warnings */}
          {data.extraction.warnings.length > 0 && (
            <section className="mb-6">
              <h2 className="text-lg font-bold mb-2 text-yellow-700">
                Warnings ({data.extraction.warnings.length})
              </h2>
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-sm">
                <ul className="list-disc list-inside space-y-1">
                  {data.extraction.warnings.map((w, i) => (
                    <li key={i} className="text-yellow-800">
                      {w}
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          )}

          {/* Engineer's Estimate */}
          {data.engineerEstimate && (
            <section className="mb-6">
              <h2 className="text-lg font-bold mb-2">
                Engineer&apos;s Estimate: {formatMoney(data.engineerEstimate.total)}
              </h2>
              {data.engineerEstimate.lineItems && (
                <div className="bg-white rounded-lg p-4 shadow-sm">
                  <LineItemsTable
                    items={data.engineerEstimate.lineItems}
                    sourceFile={data.sourceFile}
                    pathPrefix="engineerEstimate.lineItems"
                    onContested={loadContests}
                  />
                </div>
              )}
            </section>
          )}

          {/* Bidders */}
          <section>
            <h2 className="text-lg font-bold mb-2">
              Bidders ({data.bidders.length})
            </h2>
            {data.bidders.map((bidder, i) => (
              <div
                key={i}
                className="bg-white rounded-lg p-4 shadow-sm mb-4"
              >
                <div className="flex items-center gap-3 mb-2">
                  <span className="bg-blue-600 text-white px-2 py-0.5 rounded-full text-xs font-bold">
                    #{bidder.rank}
                  </span>
                  <span className="font-bold">{bidder.name}</span>
                  {bidder.totalBaseBid != null && (
                    <ContestableValue
                      value={bidder.totalBaseBid}
                      formatted={formatMoney(bidder.totalBaseBid)}
                      sourceFile={data.sourceFile}
                      fieldPath={`bidders.${i}.totalBaseBid`}
                      onContested={loadContests}
                      className="ml-auto text-green-600 font-bold"
                    />
                  )}
                </div>
                {bidder.address && (
                  <div className="text-sm text-gray-500 mb-1">
                    {bidder.address}
                  </div>
                )}
                {bidder.phone && (
                  <div className="text-sm text-gray-500 mb-2">
                    {bidder.phone}
                  </div>
                )}
                {bidder.lineItems && bidder.lineItems.length > 0 && (
                  <LineItemsTable
                    items={bidder.lineItems}
                    sourceFile={data.sourceFile}
                    pathPrefix={`bidders.${i}.lineItems`}
                    onContested={loadContests}
                  />
                )}
                {bidder.alternates && bidder.alternates.length > 0 && (
                  <div className="mt-3 border-t pt-3">
                    <div className="text-sm font-bold text-gray-600 mb-1">
                      Alternates
                    </div>
                    {bidder.alternates.map((alt, ai) => (
                      <div key={ai} className="ml-4 mb-2">
                        <div className="text-sm">
                          <strong>{alt.name}</strong>
                          {alt.total != null && `: ${formatMoney(alt.total)}`}
                        </div>
                        {alt.lineItems && (
                          <LineItemsTable
                            items={alt.lineItems}
                            sourceFile={data.sourceFile}
                            pathPrefix={`bidders.${i}.alternates.${ai}.lineItems`}
                            onContested={loadContests}
                          />
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </section>

          {/* Raw JSON (collapsible) */}
          <details className="mt-6">
            <summary className="cursor-pointer text-sm text-gray-500 hover:text-gray-700">
              Raw JSON
            </summary>
            <pre className="mt-2 bg-gray-800 text-green-400 p-4 rounded-lg text-xs overflow-auto max-h-96">
              {JSON.stringify(data, null, 2)}
            </pre>
          </details>
        </div>
      </div>
    </div>
  );
}
