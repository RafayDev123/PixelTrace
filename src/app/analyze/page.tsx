"use client";

import { Lock, ScanSearch, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { FileCard, UploadZone } from "@/components/upload";
import { Alert, Button, Card, PageHeader } from "@/components/ui";
import { analyzeFile, ApiError } from "@/lib/client/api";
import { FALLBACK_LIMITS, useFileQueue, useSettings } from "@/lib/client/hooks";

export default function AnalyzePage() {
  const router = useRouter();
  const { settings } = useSettings();
  const limits = settings?.limits ?? FALLBACK_LIMITS;
  const queue = useFileQueue(limits, 1);
  const [busy, setBusy] = useState(false);
  const [fatal, setFatal] = useState<string | null>(null);
  const item = queue.items[0];
  const canAnalyze = Boolean(item) && (item.status === "ready" || (item.status === "error" && !isPrecheckError(item.error ?? "")));

  async function run() {
    if (!item) return;
    setBusy(true);
    setFatal(null);
    queue.patch(item.id, { status: "uploading", progress: 0, error: undefined });
    try {
      const result = await analyzeFile(item.file, {
        onProgress: (p) => queue.patch(item.id, { progress: p, status: p >= 100 ? "analyzing" : "uploading" }),
      });
      queue.patch(item.id, { status: "done", result });
      router.push(`/report/${result.id}`);
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : "The analysis could not be completed.";
      queue.patch(item.id, { status: "error", error: msg, progress: 0 });
      setFatal(msg);
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Single image"
        title="Analyze image"
        description="Upload one image to read the metadata embedded in the file: camera, capture settings, GPS, IPTC and XMP, plus transparent forensic indicators."
        actions={
          <Link href="/bulk" className="text-sm font-medium text-accent hover:text-cyan">
            Have several images? Use Bulk Analysis →
          </Link>
        }
      />

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          {!item && <UploadZone multiple={false} limits={limits} onFiles={(f) => queue.add(f.slice(0, 1))} />}
          {!item && queue.notices.length > 0 && <Alert tone="warn">{queue.notices.join(" ")}</Alert>}

          {item && (
            <>
              <ul className="space-y-3" aria-label="Selected image">
                <FileCard item={item} onRemove={() => queue.remove(item.id)} busy={busy} />
              </ul>
              {fatal && (
                <Alert tone="error" title="Analysis failed">
                  {fatal}
                </Alert>
              )}
              {item.status === "error" && item.error && !fatal && <Alert tone="error">{item.error}</Alert>}
              <div className="flex flex-wrap items-center gap-3">
                <Button variant="primary" size="lg" loading={busy} disabled={!canAnalyze} icon={<ScanSearch className="h-5 w-5" />} onClick={run}>
                  {busy ? "Analyzing…" : "Analyze image"}
                </Button>
                <Button variant="ghost" icon={<Trash2 className="h-4 w-4" />} disabled={busy} onClick={() => queue.clear()}>
                  Clear selection
                </Button>
              </div>
            </>
          )}
        </div>

        <aside className="space-y-4">
          <Card className="p-5">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <Lock className="h-4 w-4 text-ok" aria-hidden /> What happens to your file
            </h2>
            <ul className="mt-3 space-y-2.5 text-[13px] leading-relaxed text-muted">
              <li>The image is validated by its real content, not its name or type.</li>
              <li>It is processed in server memory and discarded. The original is never stored.</li>
              <li>GPS and serial numbers are withheld until you choose to reveal them.</li>
              <li>
                {settings?.settings.saveHistory === false
                  ? "History is off: the report is kept for one hour for this session only."
                  : "The metadata report is saved to your history. You can turn this off or delete it in Settings."}
              </li>
            </ul>
          </Card>
          <Card className="p-5">
            <h2 className="text-sm font-semibold">Good to know</h2>
            <p className="mt-2 text-[13px] leading-relaxed text-muted">Many apps strip metadata when sharing. A file with little metadata is common and says nothing on its own about authenticity.</p>
          </Card>
        </aside>
      </div>
    </>
  );
}

function isPrecheckError(msg: string): boolean {
  return msg.startsWith("Larger") || msg.startsWith("Unsupported") || msg.startsWith("The file is empty") || msg.startsWith("HEIC");
}
