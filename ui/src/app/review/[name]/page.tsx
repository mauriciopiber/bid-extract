"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

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

interface BidValue {
  unitPrice?: number;
  extendedPrice?: number;
}

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

interface BidGroup {
  type: string;
  name: string;
  sections: Section[];
  totals?: Record<string, number>;
}

interface Contract {
  name: string;
  bidGroups: BidGroup[];
}

// -- Helpers --

function fmt(n: unknown): string {
  if (n == null || typeof n !== "number") return "\u2014";
  return "$" + n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// -- Aggregate View Components --

function BidderRanking({ bidders, engineerEstimate }: { bidders: BidderInfo[]; engineerEstimate?: { total: number } }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Bid Ranking</CardTitle>
      </CardHeader>
      <CardContent>
        {engineerEstimate && (
          <div className="flex items-center justify-between py-2 px-3 bg-blue-50 rounded mb-2">
            <span className="text-sm text-blue-700 font-medium">Engineer&apos;s Estimate</span>
            <span className="font-bold text-blue-700">{fmt(engineerEstimate.total)}</span>
          </div>
        )}
        <Table>
          <TableBody>
            {bidders.map((b) => (
              <TableRow key={b.rank}>
                <TableCell className="w-10">
                  <Badge variant="outline">#{b.rank}</Badge>
                </TableCell>
                <TableCell>
                  <div className="font-medium">{b.name}</div>
                  {b.address && <div className="text-xs text-muted-foreground">{b.address}</div>}
                </TableCell>
                <TableCell className="text-right font-bold text-green-700">
                  {fmt(b.totalBaseBid)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function ContractView({ contract, bidderNames }: { contract: Contract; bidderNames: string[] }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">{contract.name}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {contract.bidGroups.map((group, gi) => (
          <BidGroupView key={gi} group={group} bidderNames={bidderNames} />
        ))}
      </CardContent>
    </Card>
  );
}

function BidGroupView({ group, bidderNames }: { group: BidGroup; bidderNames: string[] }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <span className="font-medium text-sm">{group.name}</span>
        <Badge variant="outline" className="text-xs">{group.type}</Badge>
      </div>

      {group.sections.map((section, si) => (
        <SectionView key={si} section={section} bidderNames={bidderNames} />
      ))}

      {group.totals && Object.keys(group.totals).length > 0 && (
        <div className="border-t-2 pt-2 mt-2">
          <div className="flex flex-wrap gap-4">
            {Object.entries(group.totals).map(([name, total]) => (
              <div key={name} className="text-sm">
                <span className="text-muted-foreground">{name}: </span>
                <span className="font-bold">{fmt(total)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function SectionView({ section, bidderNames }: { section: Section; bidderNames: string[] }) {
  return (
    <div className="mb-4">
      {section.name && (
        <div className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-1">
          {section.name}
        </div>
      )}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-12">#</TableHead>
            <TableHead>Description</TableHead>
            <TableHead className="w-16">Unit</TableHead>
            <TableHead className="w-16 text-right">Qty</TableHead>
            <TableHead className="text-right">Eng Est</TableHead>
            {bidderNames.map((name) => (
              <TableHead key={name} className="text-right">
                {name.length > 15 ? name.slice(0, 15) + "…" : name}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {section.items.map((item, ii) => (
            <ItemRow key={ii} item={item} bidderNames={bidderNames} />
          ))}
        </TableBody>
      </Table>

      {section.subtotals && Object.keys(section.subtotals).length > 0 && (
        <div className="flex gap-4 mt-1 text-xs text-muted-foreground border-t pt-1">
          <span className="font-medium">Subtotal:</span>
          {Object.entries(section.subtotals).map(([name, total]) => (
            <span key={name}>{name}: <strong>{fmt(total)}</strong></span>
          ))}
        </div>
      )}
    </div>
  );
}

function ItemRow({ item, bidderNames, indent = 0 }: { item: Item; bidderNames: string[]; indent?: number }) {
  return (
    <>
      <TableRow className={indent > 0 ? "text-muted-foreground" : ""}>
        <TableCell className="font-mono text-xs">{indent > 0 ? "  " : ""}{item.itemNo}</TableCell>
        <TableCell style={{ paddingLeft: indent * 16 + 8 }}>
          <span className="text-sm">{item.description}</span>
        </TableCell>
        <TableCell className="text-xs">{item.unit}</TableCell>
        <TableCell className="text-right text-xs">{item.quantity}</TableCell>
        <TableCell className="text-right text-xs text-blue-600">
          {item.engineerEstimate ? fmt(item.engineerEstimate.extendedPrice) : ""}
        </TableCell>
        {bidderNames.map((name) => {
          const bid = item.bids[name];
          return (
            <TableCell key={name} className="text-right text-xs">
              {bid ? fmt(bid.extendedPrice) : ""}
            </TableCell>
          );
        })}
      </TableRow>
      {item.subItems?.map((sub, si) => (
        <ItemRow key={si} item={sub} bidderNames={bidderNames} indent={indent + 1} />
      ))}
    </>
  );
}

// -- Page View Components --

function PageCard({ page }: { page: PageData }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <CardTitle className="text-sm">Page {page.pageNumber}</CardTitle>
          <Badge variant="outline">{page.pageType}</Badge>
          {page.confidence != null && (
            <span className="text-xs text-muted-foreground">
              {Math.round(page.confidence * 100)}%
            </span>
          )}
        </div>
        {page.notes && <p className="text-xs text-muted-foreground mt-1">{page.notes}</p>}
      </CardHeader>
      <CardContent>
        <PageDataView data={page.data} pageType={page.pageType} />
      </CardContent>
    </Card>
  );
}

function PageDataView({ data, pageType }: { data: Record<string, unknown>; pageType: string }) {
  if (pageType === "bid_ranking") {
    const bidders = (data.bidders as BidderInfo[]) ?? [];
    return (
      <Table>
        <TableBody>
          {bidders.map((b, i) => (
            <TableRow key={i}>
              <TableCell><Badge variant="outline">#{b.rank}</Badge></TableCell>
              <TableCell className="font-medium">{b.name}</TableCell>
              <TableCell className="text-right font-bold text-green-700">{fmt(b.totalBaseBid)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    );
  }

  if (pageType === "bid_tabulation") {
    const sections = (data.sections as Section[]) ?? [];
    const bidders = (data.bidders as string[]) ?? [];
    return (
      <div className="space-y-3">
        {data.bidGroupName && (
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">{data.bidGroupName as string}</span>
            <Badge variant="outline" className="text-xs">{data.bidGroupType as string}</Badge>
          </div>
        )}
        {sections.map((section, si) => (
          <SectionView key={si} section={section} bidderNames={bidders} />
        ))}
        {data.totals && (
          <div className="border-t pt-2 flex gap-4 text-sm">
            {Object.entries(data.totals as Record<string, number>).map(([name, total]) => (
              <span key={name}><span className="text-muted-foreground">{name}:</span> <strong>{fmt(total)}</strong></span>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (pageType === "cover") {
    const project = data.project as Record<string, string> | undefined;
    return (
      <div className="space-y-1 text-sm">
        {project && Object.entries(project).map(([k, v]) => (
          <div key={k}><span className="text-muted-foreground capitalize">{k}:</span> {v}</div>
        ))}
        {data.engineer && <div><span className="text-muted-foreground">Engineer:</span> {data.engineer as string}</div>}
      </div>
    );
  }

  return <pre className="text-xs bg-muted p-3 rounded overflow-auto">{JSON.stringify(data, null, 2)}</pre>;
}

// -- Main Review Page --

export default function ReviewPage() {
  const { name } = useParams();
  const [pages, setPages] = useState<PageData[]>([]);
  const [fullData, setFullData] = useState<Record<string, unknown> | null>(null);
  const [evalData, setEvalData] = useState<{ mathScore: number | null; completenessScore: number | null; overallScore: number | null } | null>(null);
  const [logs, setLogs] = useState<{ step: string; level: string; message: string }[]>([]);
  const [sourceFile, setSourceFile] = useState("");

  useEffect(() => {
    fetch(`/api/extractions/${name}/pages`).then((r) => r.json()).then(setPages);
    fetch(`/api/extractions/${name}`).then((r) => r.json()).then((d) => {
      setFullData(d);
      setEvalData(d._eval);
      setLogs(d._logs ?? []);
      setSourceFile(d.sourceFile ?? "");
    });
  }, [name]);

  const bidders = (fullData?.bidders as BidderInfo[]) ?? [];
  const contracts = (fullData?.contracts as Contract[]) ?? [];
  const engineerEstimate = fullData?.engineerEstimate as { total: number } | undefined;
  const project = fullData?.project as Record<string, string> | undefined;
  const bidderNames = bidders.map((b) => b.name);
  const pdfName = sourceFile.replace(".pdf", "");

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b px-6 py-4">
        <div className="flex items-center gap-3">
          <Link href="/" className="text-muted-foreground hover:text-foreground text-sm">&larr;</Link>
          <div className="flex-1">
            <h1 className="text-xl font-bold">{project?.name ?? `Extraction #${name}`}</h1>
            {project?.owner && <p className="text-sm text-muted-foreground">{project.owner} {project.bidDate ? `— ${project.bidDate}` : ""}</p>}
          </div>
          {evalData && (
            <div className="flex gap-2">
              <Badge variant="outline">math {evalData.mathScore}%</Badge>
              <Badge variant="outline">complete {evalData.completenessScore}%</Badge>
              <Badge className={`${(evalData.overallScore ?? 0) >= 90 ? "bg-green-600" : (evalData.overallScore ?? 0) >= 70 ? "bg-yellow-600" : "bg-red-600"}`}>
                {evalData.overallScore}%
              </Badge>
            </div>
          )}
        </div>
      </header>

      {/* Pipeline steps */}
      {logs.length > 0 && (
        <div className="px-6 py-2 border-b bg-muted/50 flex gap-3 overflow-x-auto text-xs text-muted-foreground">
          {logs.map((l, i) => (
            <span key={i} className={l.level === "error" ? "text-red-500" : ""}>
              [{l.step}] {l.message}
            </span>
          ))}
        </div>
      )}

      <main className="p-6">
        <Tabs defaultValue="pages">
          <TabsList>
            <TabsTrigger value="pages">Pages ({pages.length})</TabsTrigger>
            <TabsTrigger value="aggregate">Aggregate</TabsTrigger>
          </TabsList>

          {/* Tab: Pages — page by page review */}
          <TabsContent value="pages" className="space-y-4 mt-4">
            {pages.map((page) => (
              <div key={page.pageNumber} className="grid grid-cols-2 gap-4">
                {/* PDF page */}
                <Card>
                  <CardContent className="p-0">
                    <iframe
                      src={`/api/pdf/${pdfName}#page=${page.pageNumber}`}
                      className="w-full h-[700px] rounded"
                      title={`Page ${page.pageNumber}`}
                    />
                  </CardContent>
                </Card>

                {/* Extracted data */}
                <PageCard page={page} />
              </div>
            ))}

            {pages.length === 0 && fullData && (
              <Card>
                <CardContent className="grid grid-cols-2 gap-4 p-4">
                  <iframe
                    src={`/api/pdf/${pdfName}`}
                    className="w-full h-[700px] rounded border"
                    title="PDF"
                  />
                  <div>
                    <BidderRanking bidders={bidders} engineerEstimate={engineerEstimate} />
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Tab: Aggregate — combined result */}
          <TabsContent value="aggregate" className="space-y-4 mt-4">
            <BidderRanking bidders={bidders} engineerEstimate={engineerEstimate} />

            {contracts.map((contract, ci) => (
              <ContractView key={ci} contract={contract} bidderNames={bidderNames} />
            ))}

            {contracts.length === 0 && bidders.length > 0 && (
              <Card>
                <CardContent className="p-4 text-sm text-muted-foreground">
                  No line items extracted — this is a bid ranking only.
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
