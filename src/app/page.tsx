"use client";

import { Calendar, FileQuestion, Images, Layers, MapPin, ScanSearch, Upload } from "lucide-react";
import Link from "next/link";
import { Badge, Card, CardHeader, EmptyState, ErrorState, LinkButton, PageHeader, SeverityBadge, Spinner, StatCard } from "@/components/ui";
import { cameraLabel, timeAgo } from "@/lib/client/format";
import { api } from "@/lib/client/api";
import { useAsync } from "@/lib/client/hooks";
import type { DashboardStats } from "@/lib/types";

function Distribution({ title, subtitle, rows, empty }: { title: string; subtitle: string; rows: { label: string; count: number }[]; empty: string }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <Card>
      <CardHeader title={title} subtitle={subtitle} />
      {rows.length === 0 ? (
        <p className="px-5 py-8 text-center text-[13.5px] text-muted">{empty}</p>
      ) : (
        <ul className="space-y-3.5 p-5">
          {rows.map((r) => (
            <li key={r.label}>
              <div className="mb-1.5 flex items-center justify-between gap-3 text-[13px]">
                <span className="truncate text-fg">{r.label}</span>
                <span className="font-mono text-muted">{r.count}</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-raised" aria-hidden>
                <div className="h-full rounded-full bg-gradient-to-r from-accent to-cyan" style={{ width: `${(r.count / max) * 100}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function Dashboard({ stats }: { stats: DashboardStats }) {
  if (stats.total === 0) {
    return (
      <Card>
        <EmptyState
          icon={<ScanSearch className="h-8 w-8" />}
          title="No images analyzed yet"
          action={
            <LinkButton href="/analyze" variant="primary" size="lg" icon={<Upload className="h-4 w-4" />}>
              Analyze your first image
            </LinkButton>
          }
        >
          Statistics, recent activity and distributions appear here once you analyze images with history enabled. Everything on this page is computed from your real analyses, never sample data.
        </EmptyState>
      </Card>
    );
  }
  return (
    <div className="space-y-5">
      <section aria-label="Key figures" className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard label="Images analyzed" value={stats.total} icon={<Images className="h-4 w-4" />} />
        <StatCard label="Today" value={stats.today} icon={<Calendar className="h-4 w-4" />} tone="cyan" />
        <StatCard label="Sessions" value={stats.sessions} hint="Single + batch runs" icon={<Layers className="h-4 w-4" />} />
        <StatCard label="With GPS" value={stats.withGps} icon={<MapPin className="h-4 w-4" />} tone="ok" />
        <StatCard label="No EXIF" value={stats.missingMetadata} icon={<FileQuestion className="h-4 w-4" />} tone="warn" />
      </section>
      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader title="Recent activity" action={<Link href="/history" className="text-[13px] font-medium text-accent hover:text-cyan">View all →</Link>} />
          <ul className="divide-y divide-line">
            {stats.recent.map((r) => (
              <li key={r.id}>
                <Link href={`/report/${r.id}`} className="flex items-center justify-between gap-3 px-5 py-3.5 transition-colors hover:bg-panel2">
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-fg">{r.filename}</span>
                    <span className="block truncate text-[12.5px] text-muted">
                      {cameraLabel(r.cameraMake, r.cameraModel) ?? "No camera information"} · {r.format} · {timeAgo(r.createdAt)}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-1.5">
                    {r.hasGps && <Badge tone="cyan">GPS</Badge>}
                    <SeverityBadge severity={r.topSeverity} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
        <div className="space-y-5">
          <Distribution title="File formats" subtitle="Detected from file content" rows={stats.formats} empty="No data yet." />
          <Distribution title="Camera manufacturers" subtitle="Where recorded in metadata" rows={stats.makers} empty="No camera manufacturer was recorded in any analyzed image." />
        </div>
      </div>
    </div>
  );
}

export default function OverviewPage() {
  const { data, error, loading, reload } = useAsync<DashboardStats>(() => api.dashboard(), []);
  return (
    <>
      <PageHeader
        eyebrow="Digital Evidence Studio"
        title="Know what an image really carries"
        description="PixelTrace reads the metadata embedded in your image files and explains what it shows, what is missing and what cannot be concluded."
        actions={
          <>
            <LinkButton href="/analyze" variant="primary" size="lg" icon={<ScanSearch className="h-5 w-5" />}>
              Analyze image
            </LinkButton>
            <LinkButton href="/bulk" size="lg" icon={<Images className="h-4 w-4" />}>
              Bulk analysis
            </LinkButton>
          </>
        }
      />
      {loading && <Spinner label="Loading overview" />}
      {error && <Card><ErrorState message={error} onRetry={reload} /></Card>}
      {data && <Dashboard stats={data} />}
    </>
  );
}
