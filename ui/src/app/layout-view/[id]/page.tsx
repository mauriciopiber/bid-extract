"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface Extraction {
  id: number;
  pdfFile: string;
  bidderCount: number | null;
  lineItemCount: number | null;
  warningCount: number | null;
  overallScore: number | null;
  processingTimeMs: number | null;
}

interface Layout {
  id: number;
  fingerprint: string;
  name: string;
  status: string;
  sampleCount: number;
}

export default function LayoutPage() {
  const { id } = useParams();
  const [extractions, setExtractions] = useState<Extraction[]>([]);
  const [layout, setLayout] = useState<Layout | null>(null);

  useEffect(() => {
    fetch(`/api/layouts/${id}/extractions`).then((r) => r.json()).then(setExtractions);
    fetch("/api/layouts").then((r) => r.json()).then((all: Layout[]) => {
      setLayout(all.find((l) => l.id === Number(id)) ?? null);
    });
  }, [id]);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b px-6 py-4">
        <div className="flex items-center gap-3">
          <Link href="/" className="text-muted-foreground hover:text-foreground text-sm">&larr;</Link>
          <div>
            <h1 className="text-xl font-bold">{layout?.name ?? `Layout #${id}`}</h1>
            {layout && <p className="text-xs text-muted-foreground font-mono">{layout.fingerprint}</p>}
          </div>
          {layout && <Badge className="ml-auto">{layout.status}</Badge>}
        </div>
      </header>

      <main className="p-6">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>ID</TableHead>
              <TableHead>Document</TableHead>
              <TableHead className="text-center">Bidders</TableHead>
              <TableHead className="text-center">Items</TableHead>
              <TableHead className="text-center">Warnings</TableHead>
              <TableHead className="text-center">Score</TableHead>
              <TableHead className="text-right">Time</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {extractions.map((e) => (
              <TableRow key={e.id}>
                <TableCell className="text-muted-foreground">#{e.id}</TableCell>
                <TableCell>
                  <Link href={`/review/${e.id}`} className="text-primary hover:underline font-medium">
                    {e.pdfFile.replace("Fixture_", "").replace(".pdf", "").replace(/_/g, " ")}
                  </Link>
                </TableCell>
                <TableCell className="text-center">{e.bidderCount ?? 0}</TableCell>
                <TableCell className="text-center">{e.lineItemCount ?? 0}</TableCell>
                <TableCell className="text-center">
                  {(e.warningCount ?? 0) > 0 && <Badge variant="secondary">{e.warningCount}</Badge>}
                </TableCell>
                <TableCell className="text-center">
                  {e.overallScore != null && (
                    <span className={`font-bold ${
                      e.overallScore >= 90 ? "text-green-600" : e.overallScore >= 70 ? "text-yellow-600" : "text-red-600"
                    }`}>
                      {e.overallScore}
                    </span>
                  )}
                </TableCell>
                <TableCell className="text-right text-muted-foreground">
                  {((e.processingTimeMs ?? 0) / 1000).toFixed(1)}s
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </main>
    </div>
  );
}
