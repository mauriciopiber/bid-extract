"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";

// -- Types --

interface PageData {
  pageNumber: number;
  pageType: string;
  confidence: number | null;
  data: Record<string, unknown>;
  notes: string | null;
}

interface BidderInfo {
  rank: number;
  name: string;
  totalBaseBid?: number;
  address?: string;
}

interface BidValue { unitPrice?: number; extendedPrice?: number }

interface Item {
  itemNo: string | number;
  description: string;
  unit?: string;
  quantity?: number;
  bids: Record<string, BidValue>;
  engineerEstimate?: BidValue;
  subItems?: Item[];
}

interface Section {
  name: string;
  items: Item[];
  subtotals?: Record<string, number>;
}

// -- Helpers --

function fmt(n: unknown): string {
  if (n == null || typeof n !== "number") return "\u2014";
  return "$" + n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// -- Page Type Components --

function BidRankingPage({ data }: { data: Record<string, unknown> }) {
  const bidders = (data.bidders as BidderInfo[]) ?? [];
  const project = data.project as Record<string, string> | undefined;

  return (
    <div className="space-y-4">
      {project?.name && (
        <div>
          <h2 className="text-lg font-bold">{project.name}</h2>
          {project.owner && <p className="text-sm text-muted-foreground">{project.owner}</p>}
          {project.bidDate && <p className="text-sm text-muted-foreground">{project.bidDate}</p>}
          {project.projectId && <p className="text-xs text-muted-foreground font-mono">{project.projectId}</p>}
        </div>
      )}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-16">Rank</TableHead>
            <TableHead>Bidder</TableHead>
            <TableHead className="text-right">Total Bid</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {bidders.map((b, i) => (
            <TableRow key={i}>
              <TableCell><Badge variant="outline">#{b.rank}</Badge></TableCell>
              <TableCell>
                <div className="font-medium">{b.name}</div>
                {b.address && <div className="text-xs text-muted-foreground">{b.address}</div>}
              </TableCell>
              <TableCell className="text-right font-bold text-green-700 text-lg">{fmt(b.totalBaseBid)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function BidTabulationPage({ data }: { data: Record<string, unknown> }) {
  const sections = (data.sections as Section[]) ?? [];
  const bidderNames = (data.bidders as string[]) ?? [];
  const totals = data.totals as Record<string, number> | undefined;

  return (
    <div className="space-y-4">
      {data.bidGroupName && (
        <div className="flex items-center gap-2">
          <h2 className="font-bold">{data.bidGroupName as string}</h2>
          <Badge variant="outline">{data.bidGroupType as string}</Badge>
        </div>
      )}

      {sections.map((section, si) => (
        <div key={si}>
          {section.name && (
            <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-2">{section.name}</h3>
          )}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">#</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="w-14">Unit</TableHead>
                <TableHead className="w-14 text-right">Qty</TableHead>
                <TableHead className="text-right">Eng Est</TableHead>
                {bidderNames.map((n) => (
                  <TableHead key={n} className="text-right">{n.length > 20 ? n.slice(0, 20) + "…" : n}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {section.items.map((item, ii) => (
                <ItemRows key={ii} item={item} bidderNames={bidderNames} />
              ))}
            </TableBody>
          </Table>
          {section.subtotals && (
            <div className="flex gap-4 text-xs text-muted-foreground border-t pt-1 mt-1">
              <span className="font-bold">Subtotal:</span>
              {Object.entries(section.subtotals).map(([n, t]) => (
                <span key={n}>{n}: <strong className="text-foreground">{fmt(t)}</strong></span>
              ))}
            </div>
          )}
        </div>
      ))}

      {totals && (
        <div className="border-t-2 pt-3 flex gap-6">
          {Object.entries(totals).map(([n, t]) => (
            <div key={n}>
              <div className="text-xs text-muted-foreground">{n}</div>
              <div className="font-bold text-lg text-green-700">{fmt(t)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ItemRows({ item, bidderNames, depth = 0 }: { item: Item; bidderNames: string[]; depth?: number }) {
  return (
    <>
      <TableRow className={depth > 0 ? "text-muted-foreground text-xs" : ""}>
        <TableCell className="font-mono text-xs">{item.itemNo}</TableCell>
        <TableCell style={{ paddingLeft: depth * 20 + 8 }}>{item.description}</TableCell>
        <TableCell className="text-xs">{item.unit}</TableCell>
        <TableCell className="text-right text-xs">{item.quantity}</TableCell>
        <TableCell className="text-right text-xs text-blue-600">
          {item.engineerEstimate ? fmt(item.engineerEstimate.extendedPrice) : ""}
        </TableCell>
        {bidderNames.map((n) => (
          <TableCell key={n} className="text-right text-xs">
            {item.bids[n] ? fmt(item.bids[n].extendedPrice) : ""}
          </TableCell>
        ))}
      </TableRow>
      {item.subItems?.map((sub, i) => (
        <ItemRows key={i} item={sub} bidderNames={bidderNames} depth={depth + 1} />
      ))}
    </>
  );
}

function CoverPage({ data }: { data: Record<string, unknown> }) {
  const project = data.project as Record<string, string> | undefined;
  return (
    <div className="space-y-2">
      {project && Object.entries(project).map(([k, v]) => (
        <div key={k} className="text-sm">
          <span className="text-muted-foreground capitalize">{k}: </span>{v}
        </div>
      ))}
      {data.engineer && <div className="text-sm"><span className="text-muted-foreground">Engineer: </span>{data.engineer as string}</div>}
    </div>
  );
}

function GenericPage({ data }: { data: Record<string, unknown> }) {
  return <pre className="text-xs bg-muted p-3 rounded overflow-auto max-h-96">{JSON.stringify(data, null, 2)}</pre>;
}

// -- Main --

export default function ReviewPage() {
  const { name } = useParams();
  const [pages, setPages] = useState<PageData[]>([]);
  const [currentPage, setCurrentPage] = useState(0);
  const [fullData, setFullData] = useState<Record<string, unknown> | null>(null);
  const [evalData, setEvalData] = useState<{ mathScore: number | null; completenessScore: number | null; overallScore: number | null } | null>(null);
  const [sourceFile, setSourceFile] = useState("");

  useEffect(() => {
    fetch(`/api/extractions/${name}/pages`).then((r) => r.json()).then((p: PageData[]) => {
      setPages(p);
      setCurrentPage(0);
    });
    fetch(`/api/extractions/${name}`).then((r) => r.json()).then((d) => {
      setFullData(d);
      setEvalData(d._eval);
      setSourceFile(d.sourceFile ?? "");
    });
  }, [name]);

  const page = pages[currentPage];
  const pdfName = sourceFile.replace(".pdf", "");
  const bidders = (fullData?.bidders as BidderInfo[]) ?? [];
  const engineerEstimate = fullData?.engineerEstimate as { total: number } | undefined;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="border-b px-6 py-3 flex items-center gap-4">
        <Link href="/" className="text-muted-foreground hover:text-foreground">&larr;</Link>
        <h1 className="font-bold">Extraction #{name}</h1>

        {/* Summary bar */}
        <div className="flex gap-3 ml-4 text-sm">
          {engineerEstimate && (
            <span className="text-blue-600">Eng Est: <strong>{fmt(engineerEstimate.total)}</strong></span>
          )}
          {bidders.filter(b => b.totalBaseBid).map((b) => (
            <span key={b.rank}>#{b.rank} {b.name.split(/[,\s]/)[0]}: <strong className="text-green-700">{fmt(b.totalBaseBid)}</strong></span>
          ))}
        </div>

        {evalData && (
          <div className="flex gap-1 ml-auto">
            <Badge variant="outline" className="text-xs">math {evalData.mathScore}%</Badge>
            <Badge variant="outline" className="text-xs">comp {evalData.completenessScore}%</Badge>
            <Badge className={`text-xs ${(evalData.overallScore ?? 0) >= 90 ? "bg-green-600" : "bg-yellow-600"}`}>
              {evalData.overallScore}%
            </Badge>
          </div>
        )}
      </header>

      {/* Page navigation */}
      {pages.length > 0 && (
        <div className="border-b px-6 py-2 flex items-center gap-2">
          {pages.map((p, i) => (
            <Button
              key={p.pageNumber}
              variant={i === currentPage ? "default" : "outline"}
              size="sm"
              onClick={() => setCurrentPage(i)}
            >
              P{p.pageNumber}
              <Badge variant="secondary" className="ml-1 text-[10px]">{p.pageType.replace("bid_", "")}</Badge>
            </Button>
          ))}
        </div>
      )}

      {/* Split view: PDF left, data right */}
      <div className="flex-1 flex">
        {/* PDF */}
        <div className="w-1/2 border-r">
          {pdfName && page && (
            <iframe
              src={`/api/pdf/${pdfName}#page=${page.pageNumber}`}
              className="w-full h-full"
              title={`Page ${page?.pageNumber}`}
            />
          )}
          {!page && pdfName && (
            <iframe src={`/api/pdf/${pdfName}`} className="w-full h-full" title="PDF" />
          )}
        </div>

        {/* Extracted data */}
        <div className="w-1/2 overflow-y-auto p-6">
          {page && (
            <>
              <div className="flex items-center gap-2 mb-4">
                <h2 className="font-bold">Page {page.pageNumber}</h2>
                <Badge>{page.pageType}</Badge>
                {page.confidence != null && (
                  <span className="text-xs text-muted-foreground">{Math.round(page.confidence * 100)}%</span>
                )}
              </div>

              {page.notes && (
                <p className="text-xs text-muted-foreground mb-4">{page.notes}</p>
              )}

              {page.pageType === "bid_ranking" && <BidRankingPage data={page.data} />}
              {page.pageType === "bid_tabulation" && <BidTabulationPage data={page.data} />}
              {page.pageType === "cover" && <CoverPage data={page.data} />}
              {!["bid_ranking", "bid_tabulation", "cover"].includes(page.pageType) && <GenericPage data={page.data} />}
            </>
          )}

          {/* Fallback for old extractions without pages */}
          {pages.length === 0 && fullData && (
            <BidRankingPage data={fullData} />
          )}
        </div>
      </div>
    </div>
  );
}
