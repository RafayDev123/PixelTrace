"use client";

import { FileJson, FileText, History as HistoryIcon, Search, SearchX, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Badge, Button, Card, ConfirmDialog, EmptyState, ErrorState, inputCls, LinkButton, PageHeader, Select, SeverityBadge, Spinner, useDebounced, useToast, cx } from "@/components/ui";
import { api, reportUrl } from "@/lib/client/api";
import { cameraLabel, formatBytes, formatDate } from "@/lib/client/format";
import type { HistoryItem } from "@/lib/types";

const PAGE = 25;

export default function HistoryPage() {
  const toast = useToast();
  const [q, setQ] = useState("");
  const [format, setFormat] = useState("");
  const [gps, setGps] = useState("");
  const [metadata, setMetadata] = useState("");
  const [severity, setSeverity] = useState("");
  const dq = useDebounced(q);
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [more, setMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<HistoryItem | null>(null);
  const filtered = Boolean(dq || format || gps || metadata || severity);

  const load = useCallback(
    async (offset: number) => {
      try {
        if (offset === 0) setLoading(true);
        else setMore(true);
        const res = await api.history({ q: dq, format, gps, metadata, severity, offset, limit: PAGE });
        setItems((prev) => (offset === 0 ? res.items : [...prev, ...res.items]));
        setTotal(res.total);
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not load history.");
      } finally {
        setLoading(false);
        setMore(false);
      }
    },
    [dq, format, gps, metadata, severity],
  );

  useEffect(() => {
    void load(0);
  }, [load]);

  function clearFilters() {
    setQ("");
    setFormat("");
    setGps("");
    setMetadata("");
    setSeverity("");
  }

  async function confirmDelete() {
    const item = toDelete;
    setToDelete(null);
    if (!item) return;
    try {
      await api.deleteAnalysis(item.id);
      setItems((prev) => prev.filter((i) => i.id !== item.id));
      setTotal((t) => t - 1);
      toast("Analysis deleted.", "ok");
    } catch {
      toast("Could not delete the analysis.", "error");
    }
  }

  return (
    <>
      <PageHeader eyebrow="Archive" title="Analysis history" description="Reports saved in this browser while history is enabled. Search, filter, reopen or delete them at any time." />

      <Card className="mb-5 p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr_1fr]">
          <label className="flex flex-col gap-1 sm:col-span-2 lg:col-span-1">
            <span className="text-[11.5px] font-medium uppercase tracking-wide text-faint">Search</span>
            <span className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" aria-hidden />
              <input type="search" placeholder="Filename, camera or SHA-256…" value={q} onChange={(e) => setQ(e.target.value)} className={cx(inputCls, "pl-9")} />
            </span>
          </label>
          <Select label="Format" value={format} onChange={setFormat} options={[{ value: "", label: "All formats" }, ...["JPEG", "PNG", "WebP", "TIFF"].map((f) => ({ value: f, label: f }))]} />
          <Select label="GPS" value={gps} onChange={setGps} options={[{ value: "", label: "Any" }, { value: "yes", label: "Has GPS" }, { value: "no", label: "No GPS" }]} />
          <Select label="Metadata" value={metadata} onChange={setMetadata} options={[{ value: "", label: "Any" }, { value: "none", label: "None" }, { value: "limited", label: "Limited" }, { value: "rich", label: "Rich" }]} />
          <Select label="Top indicator" value={severity} onChange={setSeverity} options={[{ value: "", label: "Any" }, { value: "high", label: "High" }, { value: "medium", label: "Medium" }, { value: "low", label: "Low" }, { value: "informational", label: "Informational" }]} />
        </div>
        {filtered && (
          <div className="mt-3 flex items-center justify-between">
            <p role="status" className="text-[13px] text-muted">
              {total} result{total === 1 ? "" : "s"}
            </p>
            <Button size="sm" variant="ghost" icon={<X className="h-3.5 w-3.5" />} onClick={clearFilters}>
              Clear filters
            </Button>
          </div>
        )}
      </Card>

      {loading && <Spinner label="Loading history" />}
      {error && !loading && <Card><ErrorState message={error} onRetry={() => load(0)} /></Card>}
      {!loading && !error && items.length === 0 && (
        <Card>
          {filtered ? (
            <EmptyState icon={<SearchX className="h-8 w-8" />} title="No analyses match these filters" action={<Button onClick={clearFilters}>Clear filters</Button>}>
              Try a different search term or remove a filter.
            </EmptyState>
          ) : (
            <EmptyState icon={<HistoryIcon className="h-8 w-8" />} title="Your history is empty" action={<LinkButton href="/analyze" variant="primary">Analyze an image</LinkButton>}>
              Analyses are saved here when history is on in Settings. Original images are never stored.
            </EmptyState>
          )}
        </Card>
      )}

      {!loading && items.length > 0 && (
        <Card>
          <ul className="divide-y divide-line">
            {items.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3.5 sm:px-5">
                <Link href={`/report/${r.id}`} className="min-w-0 flex-1 basis-64 rounded-md hover:text-cyan">
                  <span className="block truncate text-sm font-medium text-fg">{r.filename}</span>
                  <span className="mt-0.5 block truncate text-[12.5px] text-muted">
                    {cameraLabel(r.cameraMake, r.cameraModel) ?? "No camera information"} · {r.format} · {r.width}×{r.height} · {formatBytes(r.sizeBytes)}
                  </span>
                  <span className="block text-[12px] text-faint">{formatDate(r.createdAt)}</span>
                </Link>
                <div className="flex flex-wrap items-center gap-1.5">
                  {r.hasGps && <Badge tone="cyan">GPS</Badge>}
                  {!r.hasExif && <Badge>No EXIF</Badge>}
                  <SeverityBadge severity={r.topSeverity} />
                </div>
                <div className="flex items-center gap-1">
                  <LinkButton size="sm" variant="secondary" href={`/report/${r.id}`}>
                    Open
                  </LinkButton>
                  <a href={reportUrl(r.id, "pdf")} aria-label={`Download PDF for ${r.filename}`} title="Download PDF" className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-raised hover:text-fg">
                    <FileText className="h-4 w-4" />
                  </a>
                  <a href={reportUrl(r.id, "json")} aria-label={`Download JSON for ${r.filename}`} title="Download JSON" className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-raised hover:text-fg">
                    <FileJson className="h-4 w-4" />
                  </a>
                  <button type="button" aria-label={`Delete ${r.filename}`} title="Delete" onClick={() => setToDelete(r)} className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-[#2a1216] hover:text-bad">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
          <div className="flex items-center justify-between border-t border-line px-5 py-3">
            <p className="text-[13px] text-muted">
              Showing {items.length} of {total}
            </p>
            {items.length < total && (
              <Button size="sm" loading={more} onClick={() => load(items.length)}>
                Load more
              </Button>
            )}
          </div>
        </Card>
      )}

      <ConfirmDialog open={toDelete !== null} title="Delete this analysis?" tone="danger" confirmLabel="Delete" onCancel={() => setToDelete(null)} onConfirm={confirmDelete}>
        “{toDelete?.filename}” will be permanently removed from your history.
      </ConfirmDialog>
    </>
  );
}
