"use client";

import { FileJson, FileSpreadsheet, FileStack, FileText, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { Alert, Card, CardHeader, cx, EmptyState, ErrorState, inputCls, LinkButton, PageHeader, Spinner, useDebounced } from "@/components/ui";
import { api, batchUrl, reportUrl } from "@/lib/client/api";
import { formatDate } from "@/lib/client/format";
import type { HistoryItem } from "@/lib/types";

export default function ReportsPage() {
  const [q, setQ] = useState("");
  const dq = useDebounced(q);
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [loc, setLoc] = useState(false);
  const [ident, setIdent] = useState(false);
  const opts = { location: loc, identifiers: ident };

  useEffect(() => {
    let live = true;
    setLoading(true);
    api
      .history({ q: dq, limit: 100 })
      .then((r) => live && (setItems(r.items), setError(null)))
      .catch((e: unknown) => live && setError(e instanceof Error ? e.message : "Could not load reports."))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [dq]);

  const allSelected = items.length > 0 && items.every((i) => selected.includes(i.id));

  return (
    <>
      <PageHeader eyebrow="Export" title="Reports" description="Download individual reports as PDF, JSON or CSV, or export a batch summary across several analyses." />

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <div className="min-w-0 space-y-4">
          <label className="relative block">
            <span className="sr-only">Search reports</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" aria-hidden />
            <input type="search" placeholder="Search by filename, camera or SHA-256…" value={q} onChange={(e) => setQ(e.target.value)} className={cx(inputCls, "pl-9")} />
          </label>

          {loading && <Spinner label="Loading reports" />}
          {error && <Card><ErrorState message={error} /></Card>}
          {!loading && !error && items.length === 0 && (
            <Card>
              <EmptyState icon={<FileStack className="h-8 w-8" />} title={dq ? "No reports match your search" : "No reports to export yet"} action={!dq ? <LinkButton href="/analyze" variant="primary">Analyze an image</LinkButton> : undefined}>
                {dq ? "Try another search term." : "Saved analyses appear here with PDF, JSON and CSV downloads."}
              </EmptyState>
            </Card>
          )}
          {!loading && items.length > 0 && (
            <Card>
              <div className="flex items-center justify-between border-b border-line px-4 py-3 sm:px-5">
                <label className="flex items-center gap-3 text-[13px] text-muted">
                  <input type="checkbox" className="h-4 w-4 accent-[#3d8bff]" checked={allSelected} onChange={(e) => setSelected(e.target.checked ? items.map((i) => i.id) : [])} />
                  Select all ({items.length})
                </label>
                <span className="text-[13px] text-muted">{selected.length} selected</span>
              </div>
              <ul className="divide-y divide-line">
                {items.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:px-5">
                    <label className="flex min-w-0 flex-1 basis-56 items-center gap-3">
                      <input type="checkbox" className="h-4 w-4 accent-[#3d8bff]" checked={selected.includes(r.id)} onChange={(e) => setSelected((s) => (e.target.checked ? [...s, r.id] : s.filter((x) => x !== r.id)))} aria-label={`Select ${r.filename}`} />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-fg">{r.filename}</span>
                        <span className="block text-[12px] text-faint">{formatDate(r.createdAt)}</span>
                      </span>
                    </label>
                    <div className="flex gap-1.5">
                      <LinkButton size="sm" variant="secondary" href={reportUrl(r.id, "pdf", opts)} download icon={<FileText className="h-3.5 w-3.5" />}>
                        PDF
                      </LinkButton>
                      <LinkButton size="sm" variant="secondary" href={reportUrl(r.id, "json", opts)} download icon={<FileJson className="h-3.5 w-3.5" />}>
                        JSON
                      </LinkButton>
                      <LinkButton size="sm" variant="secondary" href={reportUrl(r.id, "csv", opts)} download icon={<FileSpreadsheet className="h-3.5 w-3.5" />}>
                        CSV
                      </LinkButton>
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>

        <aside className="space-y-4">
          <Card>
            <CardHeader title="Export options" />
            <fieldset className="space-y-2.5 p-4">
              <legend className="mb-1 text-[12.5px] text-muted">Sensitive fields are excluded unless you tick them.</legend>
              <label className="flex items-center gap-2.5 text-[13.5px]">
                <input type="checkbox" className="h-4 w-4 accent-[#3d8bff]" checked={loc} onChange={(e) => setLoc(e.target.checked)} /> Include GPS location
              </label>
              <label className="flex items-center gap-2.5 text-[13.5px]">
                <input type="checkbox" className="h-4 w-4 accent-[#3d8bff]" checked={ident} onChange={(e) => setIdent(e.target.checked)} /> Include serial numbers
              </label>
              {(loc || ident) && <Alert tone="warn">Exports will contain sensitive data. Store and share them carefully.</Alert>}
            </fieldset>
          </Card>
          <Card>
            <CardHeader title="Batch summary" subtitle={selected.length ? `${selected.length} selected analyses` : "Select analyses to enable"} />
            <div className="grid gap-2 p-4">
              {selected.length === 0 ? (
                <p className="text-[13px] text-muted">Tick one or more reports in the list to export a combined summary.</p>
              ) : (
                <>
                  <LinkButton variant="primary" href={batchUrl(selected, "csv", opts)} download icon={<FileSpreadsheet className="h-4 w-4" />}>
                    Summary CSV
                  </LinkButton>
                  <LinkButton href={batchUrl(selected, "json", opts)} download icon={<FileJson className="h-4 w-4" />}>
                    Summary JSON
                  </LinkButton>
                  <LinkButton href={batchUrl(selected, "json", opts, true)} download icon={<FileStack className="h-4 w-4" />}>
                    Full reports (JSON)
                  </LinkButton>
                </>
              )}
            </div>
          </Card>
        </aside>
      </div>
    </>
  );
}
