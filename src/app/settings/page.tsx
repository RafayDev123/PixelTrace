"use client";

import { Cloud, Database, Gauge, RefreshCw, ShieldCheck, Trash2 } from "lucide-react";
import { useState } from "react";
import { Alert, Badge, Button, Card, CardHeader, ConfirmDialog, ErrorState, PageHeader, Select, Spinner, Switch, useToast } from "@/components/ui";
import { api } from "@/lib/client/api";
import { formatBytes } from "@/lib/client/format";
import { useSettings } from "@/lib/client/hooks";
import type { AppSettings } from "@/lib/types";

const RETENTION = [
  { value: "0", label: "Keep until I delete" },
  { value: "1", label: "1 day" },
  { value: "7", label: "7 days" },
  { value: "30", label: "30 days" },
  { value: "90", label: "90 days" },
  { value: "365", label: "1 year" },
];

export default function SettingsPage() {
  const toast = useToast();
  const { settings, error, loading, reload, setSettings } = useSettings();
  const [confirmAll, setConfirmAll] = useState(false);
  const [busy, setBusy] = useState(false);

  async function update(patch: Partial<AppSettings>) {
    try {
      const next = await api.updateSettings(patch);
      setSettings(next);
      toast("Settings saved.", "ok");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not save settings.", "error");
    }
  }

  async function purge() {
    setBusy(true);
    try {
      const { removed } = await api.purge();
      toast(removed ? `Removed ${removed} expired ${removed === 1 ? "report" : "reports"}.` : "Nothing had expired.", "ok");
    } catch {
      toast("Cleanup failed.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function deleteAll() {
    setConfirmAll(false);
    setBusy(true);
    try {
      const { deleted } = await api.deleteAll();
      toast(`Deleted ${deleted} stored ${deleted === 1 ? "analysis" : "analyses"}.`, "ok");
    } catch {
      toast("Could not delete history.", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader eyebrow="Control" title="Settings and privacy" description="Decide what PixelTrace keeps. Uploaded images are never stored in any mode." />
      {loading && <Spinner label="Loading settings" />}
      {error && <Card><ErrorState message={error} onRetry={reload} /></Card>}
      {settings && (
        <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
          <div className="space-y-5">
            <Card>
              <CardHeader title="Retention" subtitle="What is kept after an analysis" />
              <div className="divide-y divide-line px-5">
                <Switch
                  label="Save analysis history"
                  description="Keeps the metadata report so you can reopen, export or compare it later. When off, reports are session-only and deleted automatically after one hour."
                  checked={settings.settings.saveHistory}
                  onChange={(v) => update({ saveHistory: v })}
                />
                <Switch
                  label="Keep a small preview thumbnail"
                  description="Stores a downscaled preview (max 480 px, metadata removed) with each saved report. Turn off to keep no image data at all."
                  checked={settings.settings.storeThumbnail}
                  onChange={(v) => update({ storeThumbnail: v })}
                />
                <div className="py-4">
                  <Select label="Automatically delete saved reports after" value={String(settings.settings.retentionDays)} onChange={(v) => update({ retentionDays: Number(v) })} options={RETENTION} className="max-w-xs" />
                </div>
              </div>
            </Card>

            <Card>
              <CardHeader title="Sensitive metadata" subtitle="GPS, serial numbers and similar identifiers" />
              <div className="px-5">
                <Switch
                  label="Ask for confirmation before revealing"
                  description="Shows a short privacy explanation before GPS coordinates or serial numbers appear on screen. They are always hidden until you choose to reveal them."
                  checked={settings.settings.confirmBeforeReveal}
                  onChange={(v) => update({ confirmBeforeReveal: v })}
                />
              </div>
            </Card>

            <Card>
              <CardHeader title="Data controls" />
              <div className="flex flex-wrap gap-3 p-5">
                <Button icon={<RefreshCw className="h-4 w-4" />} loading={busy} onClick={purge}>
                  Run retention cleanup now
                </Button>
                <Button variant="danger" icon={<Trash2 className="h-4 w-4" />} disabled={busy} onClick={() => setConfirmAll(true)}>
                  Delete all stored analyses
                </Button>
              </div>
            </Card>
          </div>

          <aside className="space-y-5">
            <Card>
              <CardHeader title="Cloud storage" action={<Badge tone={settings.cloud.enabled ? "warn" : "ok"}>{settings.cloud.enabled ? "Flag set" : "Disabled"}</Badge>} />
              <div className="flex gap-3 p-5">
                <Cloud className="mt-0.5 h-5 w-5 shrink-0 text-faint" aria-hidden />
                <div className="text-[13px] leading-relaxed text-muted">
                  <p>{settings.cloud.note}</p>
                  <p className="mt-2">Cloud features are controlled by server configuration, never silently. See <code className="font-mono text-[12px] text-cyan">docs/ARCHITECTURE.md</code> for the private-storage design.</p>
                </div>
              </div>
            </Card>
            <Card>
              <CardHeader title="Upload limits" subtitle="Set by the server (environment)" />
              <dl className="divide-y divide-line px-5 py-1 text-[13px]">
                {[
                  ["Images per batch", String(settings.limits.maxFiles)],
                  ["Size per image", formatBytes(settings.limits.maxFileBytes)],
                  ["Megapixels per image", `${settings.limits.maxMegapixels} MP`],
                  ["Parallel analyses", String(settings.limits.bulkConcurrency)],
                  ["Formats", settings.limits.formats.join(", ")],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-3 py-2.5">
                    <dt className="text-muted">{k}</dt>
                    <dd className="text-right text-fg">{v}</dd>
                  </div>
                ))}
              </dl>
            </Card>
            <Alert tone="info" title="What PixelTrace keeps">
              <ul className="mt-1 list-disc space-y-1 pl-4">
                <li className="flex items-start gap-1.5"><ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />Never: the uploaded image file.</li>
                <li className="flex items-start gap-1.5"><Database className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />With history on: the metadata report (including GPS and serials, withheld from every view and export unless revealed) and an optional thumbnail.</li>
                <li className="flex items-start gap-1.5"><Gauge className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />Never sent to third parties, except the optional map you load yourself.</li>
              </ul>
            </Alert>
          </aside>
        </div>
      )}
      <ConfirmDialog open={confirmAll} title="Delete all stored analyses?" tone="danger" confirmLabel="Delete everything" onCancel={() => setConfirmAll(false)} onConfirm={deleteAll}>
        This permanently removes every saved report and preview. It cannot be undone.
      </ConfirmDialog>
    </>
  );
}
