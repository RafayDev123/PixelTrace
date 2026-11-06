"use client";

import { ArrowLeft, Trash2 } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ReportView } from "@/components/report/ReportView";
import type { RevealKind } from "@/components/report/parts";
import { Button, ConfirmDialog, ErrorState, PageHeader, Spinner, useToast } from "@/components/ui";
import { api, ApiError } from "@/lib/client/api";
import { formatDate } from "@/lib/client/format";
import { useSettings } from "@/lib/client/hooks";
import type { AnalysisResult, RevealOptions } from "@/lib/types";

const COPY: Record<RevealKind, { title: string; body: string }> = {
  location: {
    title: "Reveal GPS location?",
    body: "GPS coordinates can show where this photo was taken, possibly a home, workplace or other private place. They will be visible on your screen until you hide them. Nothing is sent to third parties unless you also load the map.",
  },
  identifiers: {
    title: "Reveal serial numbers?",
    body: "Camera and lens serial numbers uniquely identify a physical device. Sharing them can link photos to the same device or its owner. They will be visible on your screen until you hide them.",
  },
};

export default function ReportPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const { settings } = useSettings();
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<{ message: string; notFound: boolean } | null>(null);
  const [reveal, setReveal] = useState<RevealOptions>({ location: false, identifiers: false });
  const [pending, setPending] = useState<RevealKind | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const load = useCallback(
    async (r: RevealOptions) => {
      try {
        const data = await api.analysis(id, r);
        setResult(data);
        setError(null);
        setReveal(r);
      } catch (e) {
        if (e instanceof ApiError) setError({ message: e.message, notFound: e.status === 404 });
        else setError({ message: "The report could not be loaded.", notFound: false });
      }
    },
    [id],
  );

  useEffect(() => {
    load({ location: false, identifiers: false });
  }, [load]);

  async function doReveal(kind: RevealKind) {
    await load({ ...reveal, [kind]: true });
    toast(kind === "location" ? "Location revealed on this screen." : "Serial numbers revealed on this screen.", "info");
  }
  function requestReveal(kind: RevealKind) {
    if (settings?.settings.confirmBeforeReveal === false) void doReveal(kind);
    else setPending(kind);
  }
  async function hide(kind: RevealKind) {
    await load({ ...reveal, [kind]: false });
    toast("Hidden again.", "ok");
  }

  async function remove() {
    setConfirmDelete(false);
    try {
      await api.deleteAnalysis(id);
      toast("Analysis deleted.", "ok");
      router.push("/history");
    } catch {
      toast("The analysis could not be deleted.", "error");
    }
  }

  if (error)
    return (
      <>
        <PageHeader eyebrow="Report" title={error.notFound ? "Report not found" : "Report unavailable"} />
        <ErrorState message={error.message} onRetry={error.notFound ? undefined : () => load(reveal)} />
        <div className="text-center">
          <Link href="/analyze" className="text-sm font-medium text-accent hover:text-cyan">
            Analyze another image →
          </Link>
        </div>
      </>
    );
  if (!result) return <Spinner label="Loading report" />;

  return (
    <>
      <PageHeader
        eyebrow="Analysis report"
        title={result.file.filename}
        description={`Analyzed ${formatDate(result.analyzedAt)} · ${result.file.detectedFormat} · ${result.file.width}×${result.file.height}`}
        actions={
          <>
            <Link href="/history" className="inline-flex h-10 items-center gap-2 rounded-lg px-3 text-sm font-medium text-muted hover:bg-raised hover:text-fg">
              <ArrowLeft className="h-4 w-4" aria-hidden /> History
            </Link>
            <Link href="/analyze" className="inline-flex h-10 items-center rounded-lg border border-line2 bg-raised px-4 text-sm font-medium hover:bg-[#1d2a47]">
              Analyze another
            </Link>
            <Button variant="danger" icon={<Trash2 className="h-4 w-4" />} onClick={() => setConfirmDelete(true)}>
              Delete
            </Button>
          </>
        }
      />
      <ReportView result={result} onReveal={requestReveal} onHide={hide} />

      <ConfirmDialog open={pending !== null} title={pending ? COPY[pending].title : ""} confirmLabel="Reveal" onCancel={() => setPending(null)} onConfirm={() => {
        const k = pending;
        setPending(null);
        if (k) void doReveal(k);
      }}>
        {pending ? COPY[pending].body : ""}
      </ConfirmDialog>
      <ConfirmDialog open={confirmDelete} title="Delete this analysis?" tone="danger" confirmLabel="Delete" onCancel={() => setConfirmDelete(false)} onConfirm={remove}>
        The stored report and preview will be permanently removed. The original image was never stored.
      </ConfirmDialog>
    </>
  );
}
