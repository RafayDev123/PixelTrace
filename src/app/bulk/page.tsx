"use client";

import { Copy, Download, FileJson, FileSpreadsheet, GitCompare, Images, Play, RotateCw, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRef, useState } from "react";
import { CompareTable } from "@/components/Compare";
import { FileCard, UploadZone } from "@/components/upload";
import { Alert, Badge, Button, Card, CardHeader, cx, LinkButton, PageHeader, ProgressBar, SeverityBadge, StatCard } from "@/components/ui";
import { analyzeFile, ApiError, batchUrl, reportUrl } from "@/lib/client/api";
import { cameraLabel } from "@/lib/client/format";
import { FALLBACK_LIMITS, useFileQueue, useSettings, type QueueItem } from "@/lib/client/hooks";
import { CheckCircle2, ShieldAlert, MapPin, FileWarning } from "lucide-react";

export default function BulkPage() {
  const { settings } = useSettings();
  const limits = settings?.limits ?? FALLBACK_LIMITS;
  const queue = useFileQueue(limits, limits.maxFiles);
  const [running, setRunning] = useState(false);
  const [started, setStarted] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const session = useRef<string>("");

  const ready = queue.items.filter((i) => i.status === "ready");
  const failedRetryable = queue.items.filter((i) => i.status === "error" && i.progress === 0 && i.error && !/^(Larger|Unsupported|The file is empty|HEIC)/.test(i.error));
  const done = queue.items.filter((i) => i.status === "done" && i.result);
  const failed = queue.items.filter((i) => i.status === "error");
  const finished = done.length + failed.length;
  const total = queue.items.length;
  const overall = total ? Math.round((finished / total) * 100) : 0;

  async function processOne(item: QueueItem) {
    queue.patch(item.id, { status: "uploading", progress: 0, error: undefined });
    try {
      const result = await analyzeFile(item.file, {
        sessionId: session.current,
        onProgress: (p) => queue.patch(item.id, { progress: p, status: p >= 100 ? "analyzing" : "uploading" }),
      });
      queue.patch(item.id, { status: "done", result, progress: 100 });
    } catch (e) {
      queue.patch(item.id, { status: "error", error: e instanceof ApiError ? e.message : "Analysis failed.", progress: 0 });
    }
  }

  async function runAll(targets: QueueItem[]) {
    if (!session.current) session.current = crypto.randomUUID();
    setRunning(true);
    setStarted(true);
    const pending = [...targets];
    const workers = Array.from({ length: Math.min(limits.bulkConcurrency, pending.length) }, async () => {
      while (pending.length) {
        const next = pending.shift();
        if (next) await processOne(next);
      }
    });
    await Promise.all(workers);
    setRunning(false);
  }

  function reset() {
    queue.clear();
    session.current = "";
    setStarted(false);
    setSelected([]);
  }

  const doneResults = done.map((d) => d.result!);
  const ids = doneResults.map((r) => r.id);
  const hashMap = new Map<string, string[]>();
  for (const r of doneResults) hashMap.set(r.file.sha256, [...(hashMap.get(r.file.sha256) ?? []), r.file.filename]);
  const hashGroups = [...hashMap.values()].filter((g) => g.length > 1);
  const compared = doneResults.filter((r) => selected.includes(r.id));
  const complete = started && !running && finished === total && total > 0;

  return (
    <>
      <PageHeader eyebrow="Batch queue" title="Bulk analysis" description={`Analyze up to ${limits.maxFiles} images in one session. Files are processed ${limits.bulkConcurrency} at a time, and one failure never stops the batch.`} />

      <div className="space-y-5">
        {total === 0 && <UploadZone multiple limits={limits} onFiles={(f) => queue.add(f)} />}
        {queue.notices.length > 0 && <Alert tone="warn">{queue.notices.join(" ")}</Alert>}

        {total > 0 && (
          <Card>
            <CardHeader
              title={`Batch queue (${total}/${limits.maxFiles})`}
              subtitle={running ? `Analyzing… ${finished} of ${total} complete` : complete ? "Batch complete" : `${ready.length} ready to analyze`}
              action={
                <div className="flex flex-wrap gap-2">
                  {total < limits.maxFiles && !running && (
                    <label className="inline-flex h-8 cursor-pointer items-center rounded-lg border border-line2 bg-raised px-3 text-[13px] font-medium text-fg hover:bg-[#1d2a47] focus-within:outline-2 focus-within:outline-cyan">
                      Add more
                      <input
                        type="file"
                        multiple
                        className="sr-only"
                        accept="image/jpeg,image/png,image/webp,image/tiff,.jpg,.jpeg,.png,.webp,.tif,.tiff"
                        aria-label="Add more images"
                        onChange={(e) => {
                          queue.add(Array.from(e.target.files ?? []));
                          e.target.value = "";
                        }}
                      />
                    </label>
                  )}
                  <Button size="sm" variant="ghost" icon={<Trash2 className="h-3.5 w-3.5" />} disabled={running} onClick={reset}>
                    Clear all
                  </Button>
                </div>
              }
            />
            <div className="space-y-4 p-4 sm:p-5">
              {started && (
                <div>
                  <div className="mb-1.5 flex justify-between text-[12.5px] text-muted">
                    <span>Overall progress</span>
                    <span className="font-mono">{overall}%</span>
                  </div>
                  <ProgressBar value={overall} label="Overall batch progress" tone={complete && failed.length === 0 ? "ok" : "accent"} />
                </div>
              )}
              <ul className="space-y-2.5" aria-label="Batch files">
                {queue.items.map((item) => (
                  <FileCard key={item.id} item={item} busy={running} onRemove={() => queue.remove(item.id)} onRetry={() => runAll([item])} />
                ))}
              </ul>
              <div className="flex flex-wrap items-center gap-3 pt-1">
                {ready.length > 0 && (
                  <Button variant="primary" size="lg" loading={running} icon={<Play className="h-4 w-4" />} onClick={() => runAll(ready)}>
                    {running ? "Analyzing…" : `Analyze ${ready.length} image${ready.length > 1 ? "s" : ""}`}
                  </Button>
                )}
                {failedRetryable.length > 0 && !running && (
                  <Button icon={<RotateCw className="h-4 w-4" />} onClick={() => runAll(failedRetryable)}>
                    Retry {failedRetryable.length} failed
                  </Button>
                )}
              </div>
            </div>
          </Card>
        )}

        {complete && (
          <>
            <section aria-label="Batch summary" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <StatCard label="Succeeded" value={done.length} hint={`of ${total} images`} icon={<CheckCircle2 className="h-4 w-4" />} tone="ok" />
              <StatCard label="Failed" value={failed.length} hint={failed.length ? "See errors above" : "No failures"} icon={<FileWarning className="h-4 w-4" />} tone={failed.length ? "warn" : "blue"} />
              <StatCard label="With GPS" value={doneResults.filter((r) => r.gps.present).length} hint="Coordinates hidden by default" icon={<MapPin className="h-4 w-4" />} tone="cyan" />
              <StatCard label="No EXIF" value={doneResults.filter((r) => !r.availability.hasExif).length} hint="Common after sharing" icon={<ShieldAlert className="h-4 w-4" />} />
            </section>

            {hashGroups.length > 0 && (
              <Alert tone="info" title="Duplicate files detected (identical SHA-256)">
                <ul className="mt-1 list-disc pl-5">
                  {hashGroups.map((g) => (
                    <li key={g.join("|")}>{g.join(" = ")}</li>
                  ))}
                </ul>
              </Alert>
            )}

            {done.length > 0 && (
              <Card>
                <CardHeader
                  title="Results"
                  subtitle="Open a report, or select two or more images to compare their metadata."
                  action={
                    <div className="flex flex-wrap gap-2">
                      <LinkButton size="sm" href={batchUrl(ids, "csv")} download icon={<FileSpreadsheet className="h-3.5 w-3.5" />}>
                        Summary CSV
                      </LinkButton>
                      <LinkButton size="sm" href={batchUrl(ids, "json")} download icon={<FileJson className="h-3.5 w-3.5" />}>
                        Summary JSON
                      </LinkButton>
                      <LinkButton size="sm" href={batchUrl(ids, "json", {}, true)} download icon={<Download className="h-3.5 w-3.5" />}>
                        All reports (JSON)
                      </LinkButton>
                    </div>
                  }
                />
                <ul className="divide-y divide-line">
                  {doneResults.map((r) => {
                    const cam = cameraLabel(r.camera.find((f) => f.id === "make")?.value ?? null, r.camera.find((f) => f.id === "model")?.value ?? null);
                    const isSel = selected.includes(r.id);
                    return (
                      <li key={r.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:px-5">
                        <label className="flex min-w-0 flex-1 basis-60 items-center gap-3">
                          <input type="checkbox" className="h-4 w-4 accent-[#3d8bff]" checked={isSel} onChange={(e) => setSelected((s) => (e.target.checked ? [...s, r.id] : s.filter((x) => x !== r.id)))} aria-label={`Select ${r.file.filename} for comparison`} />
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-medium text-fg">{r.file.filename}</span>
                            <span className="block truncate text-[12.5px] text-muted">{cam ?? "No camera information"} · {r.file.width}×{r.file.height}</span>
                          </span>
                        </label>
                        <div className="flex flex-wrap items-center gap-1.5">
                          {r.gps.present && <Badge tone="cyan">GPS</Badge>}
                          {!r.availability.hasExif && <Badge>No EXIF</Badge>}
                          <SeverityBadge severity={r.indicators[0]?.severity ?? "informational"} />
                        </div>
                        <div className="flex gap-1.5">
                          <LinkButton size="sm" variant="secondary" href={`/report/${r.id}`}>
                            Open
                          </LinkButton>
                          <LinkButton size="sm" variant="ghost" href={reportUrl(r.id, "pdf")} download>
                            PDF
                          </LinkButton>
                        </div>
                      </li>
                    );
                  })}
                </ul>
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-3">
                  <p className={cx("text-[13px]", selected.length >= 2 ? "text-fg" : "text-muted")}>{selected.length} selected</p>
                  <div className="flex gap-2">
                    <Button size="sm" variant="ghost" onClick={() => setSelected(ids)} icon={<Copy className="h-3.5 w-3.5" />}>
                      Select all
                    </Button>
                    <Button size="sm" variant="primary" disabled={selected.length < 2} icon={<GitCompare className="h-3.5 w-3.5" />} onClick={() => document.getElementById("compare")?.scrollIntoView({ behavior: "smooth" })}>
                      Compare
                    </Button>
                  </div>
                </div>
              </Card>
            )}

            <div id="compare">{compared.length >= 2 && <CompareTable results={compared} />}</div>
          </>
        )}

        {total === 0 && (
          <Card className="p-5">
            <div className="flex items-start gap-3">
              <Images className="mt-0.5 h-5 w-5 text-cyan" aria-hidden />
              <p className="text-[13.5px] leading-relaxed text-muted">
                Each image gets its own report. Identical files are grouped by SHA-256, and you can compare metadata across images afterwards. Prefer a single image? <Link href="/analyze" className="text-accent hover:text-cyan">Go to Analyze Image</Link>.
              </p>
            </div>
          </Card>
        )}
      </div>
    </>
  );
}
