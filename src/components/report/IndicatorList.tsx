"use client";

import { ChevronDown, Lock, Scale } from "lucide-react";
import { useState } from "react";
import type { Indicator, Severity } from "@/lib/types";
import { Alert, Card, cx, SeverityBadge, severityLabel } from "../ui";

const ORDER: Severity[] = ["high", "medium", "low", "informational"];
const ACCENT: Record<Severity, string> = {
  high: "bg-bad",
  medium: "bg-warn",
  low: "bg-cyan",
  informational: "bg-[#4a6aa5]",
};

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[11.5px] font-semibold uppercase tracking-wide text-faint">{label}</dt>
      <dd className="mt-1 text-[13.5px] leading-relaxed text-[#c8d4ec]">{children}</dd>
    </div>
  );
}

function IndicatorCard({ ind, defaultOpen }: { ind: Indicator; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Card as="article" className="overflow-hidden">
      <div className="flex">
        <span className={cx("w-1 shrink-0", ACCENT[ind.severity])} aria-hidden />
        <div className="min-w-0 flex-1">
          <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="flex w-full items-start justify-between gap-3 px-4 py-3.5 text-left">
            <span className="min-w-0">
              <span className="flex flex-wrap items-center gap-2">
                <SeverityBadge severity={ind.severity} />
                <span className="text-[14.5px] font-semibold text-fg">{ind.title}</span>
              </span>
              <span className="mt-1.5 block text-[13.5px] leading-relaxed text-muted">{ind.description}</span>
            </span>
            <ChevronDown className={cx("mt-1 h-4 w-4 shrink-0 text-faint transition-transform", open && "rotate-180")} aria-hidden />
          </button>
          {open && (
            <div className="space-y-4 border-t border-line px-4 py-4">
              <div>
                <p className="text-[11.5px] font-semibold uppercase tracking-wide text-faint">Supporting evidence</p>
                <ul className="mt-2 space-y-1.5">
                  {ind.evidence.map((ev, i) => (
                    <li key={i} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 rounded-md bg-canvas px-3 py-2 text-[13px]">
                      <span className="font-mono text-[12px] text-muted">{ev.field}</span>
                      {ev.masked ? (
                        <span className="inline-flex items-center gap-1 text-faint">
                          <Lock className="h-3 w-3" aria-hidden /> hidden for privacy
                        </span>
                      ) : ev.value ? (
                        <span className="break-all font-mono text-fg">{ev.value}</span>
                      ) : (
                        <span className="italic text-faint">not present in file</span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
              <dl className="grid gap-4 md:grid-cols-2">
                <Section label="Why it triggered">{ind.triggeredBy}</Section>
                <Section label="Why it matters">{ind.why}</Section>
                <Section label="Limitation">{ind.limitation}</Section>
                <Section label="Recommended manual review">{ind.recommendation}</Section>
              </dl>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

export function IndicatorList({ indicators }: { indicators: Indicator[] }) {
  const [filter, setFilter] = useState<Severity | "all">("all");
  const counts = ORDER.map((s) => ({ s, n: indicators.filter((i) => i.severity === s).length }));
  const shown = filter === "all" ? indicators : indicators.filter((i) => i.severity === filter);
  return (
    <div className="space-y-4">
      <Alert tone="info" title="How to read these indicators">
        <span className="flex items-start gap-2">
          <Scale className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>Rule-based observations about metadata, not an AI fake-image detector. Categories describe how much a finding may deserve a closer look. They are not probabilities, and none of them declares an image authentic or manipulated.</span>
        </span>
      </Alert>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by severity">
        {[{ s: "all" as const, n: indicators.length }, ...counts].map(({ s, n }) => (
          <button
            key={s}
            type="button"
            aria-pressed={filter === s}
            disabled={s !== "all" && n === 0}
            onClick={() => setFilter(s)}
            className={cx(
              "rounded-full border px-3 py-1.5 text-[12.5px] font-medium transition-colors disabled:opacity-40",
              filter === s ? "border-accent bg-[#12203d] text-fg" : "border-line2 text-muted hover:text-fg",
            )}
          >
            {s === "all" ? "All" : severityLabel(s)} <span className="ml-1 font-mono text-faint">{n}</span>
          </button>
        ))}
      </div>
      <div className="space-y-3">
        {shown.map((ind) => (
          <IndicatorCard key={ind.id} ind={ind} defaultOpen={ind.severity === "high" || ind.severity === "medium"} />
        ))}
        {shown.length === 0 && <p className="py-6 text-center text-sm text-muted">No indicators in this category.</p>}
      </div>
    </div>
  );
}
