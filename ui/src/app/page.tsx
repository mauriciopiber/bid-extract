"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

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

export default function Home() {
  const [layouts, setLayouts] = useState<Layout[]>([]);

  useEffect(() => {
    fetch("/api/layouts").then((r) => r.json()).then(setLayouts);
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b px-6 py-4">
        <h1 className="text-2xl font-bold">Bid Extract</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {layouts.length} layouts
        </p>
      </header>

      <main className="p-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {layouts.map((l) => (
          <Link key={l.id} href={`/layout-view/${l.id}`}>
            <Card className="hover:border-primary transition-colors cursor-pointer">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm">{l.name}</CardTitle>
                  <Badge variant={l.status === "stable" ? "default" : "secondary"}>
                    {l.status}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground font-mono">{l.fingerprint}</p>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-4 text-sm">
                  <span>{l.extractionCount} docs</span>
                  <span className="text-muted-foreground">
                    {l.cleanCount}/{l.extractionCount} clean
                  </span>
                  {l.avgScore != null && (
                    <span className={`ml-auto font-bold text-lg ${
                      l.avgScore >= 90 ? "text-green-600" : l.avgScore >= 70 ? "text-yellow-600" : "text-red-600"
                    }`}>
                      {l.avgScore}
                    </span>
                  )}
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}

        {layouts.length === 0 && (
          <p className="text-muted-foreground col-span-full text-center py-12">
            No layouts yet. Run <code className="bg-muted px-1 rounded">npx tsx src/db/seed-fixtures.ts</code>
          </p>
        )}
      </main>
    </div>
  );
}
