"use client";

import { Braces, ChevronDown, ChevronsDownUp, ChevronsUpDown, ClipboardCopy, Lock, Search, Table2 } from "lucide-react";
import { useMemo, useState } from "react";
import type { MetaEntry, SectionId } from "@/lib/types";
import { Badge, Button, Card, CopyButton, cx, inputCls, useToast } from "../ui";

const SECTIONS: { id: SectionId; title: string }[] = [
  { id: "general", title: "General Information" },
  { id: "camera", title: "Camera Information" },
  { id: "capture", title: "Capture Information" },
  { id: "gps", title: "GPS Information" },
  { id: "iptc", title: "IPTC Metadata" },
  { id: "xmp", title: "XMP Metadata" },
  { id: "technical", title: "Technical Information" },
  { id: "other", title: "Other Available Metadata" },
];

const show = (v: MetaEntry["value"]): string => (v === null ? "" : Array.isArray(v) ? v.join(", ") : String(v));

function EntryRow({ e }: { e: MetaEntry }) {
  return (
    <div className="grid gap-0.5 border-t border-line/70 px-4 py-2.5 sm:grid-cols-[minmax(150px,240px)_1fr] sm:gap-4">
      <div className="min-w-0">
        <p className="break-words font-mono text-[12.5px] text-muted">{e.key}</p>
        <p className="text-[11px] text-faint">{e.group}</p>
      </div>
      <div className="flex min-w-0 items-start justify-between gap-2">
        <div className="min-w-0 break-words text-[13.5px]">
          {e.masked ? (
            <span className="inline-flex items-center gap-1.5 text-faint">
              <Lock className="h-3.5 w-3.5" aria-hidden /> Hidden (sensitive {e.sensitiveKind === "location" ? "location" : "identifier"})
            </span>
          ) : e.status === "empty" ? (
            <Badge>Empty field</Badge>
          ) : e.status === "unreadable" ? (
            <Badge tone="warn">Could not be read</Badge>
          ) : (
            <span className="whitespace-pre-wrap text-fg">{show(e.value)}</span>
          )}
        </div>
        {!e.masked && e.status === "present" && <CopyButton text={show(e.value)} label={`Copy value of ${e.key}`} />}
      </div>
    </div>
  );
}

export function MetadataExplorer({ entries, filename }: { entries: MetaEntry[]; filename: string }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<Set<SectionId>>(new Set(["general", "camera", "capture"]));
  const [raw, setRaw] = useState(false);
  const toast = useToast();

  const q = query.trim().toLowerCase();
  const grouped = useMemo(() => {
    return SECTIONS.map((s) => {
      const all = entries.filter((e) => e.section === s.id);
      const matches = q ? all.filter((e) => e.key.toLowerCase().includes(q) || (!e.masked && show(e.value).toLowerCase().includes(q)) || e.group.toLowerCase().includes(q)) : all;
      return { ...s, all, matches };
    });
  }, [entries, q]);

  const totalMatches = grouped.reduce((n, g) => n + g.matches.length, 0);
  const exportable = entries.filter((e) => !e.masked);
  const json = useMemo(() => JSON.stringify(Object.fromEntries(SECTIONS.map((s) => [s.id, entries.filter((e) => e.section === s.id).map((e) => ({ group: e.group, key: e.key, value: e.masked ? "[hidden]" : e.value, status: e.status }))])), null, 2), [entries]);

  function toggle(id: SectionId) {
    setOpen((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  async function copyAll() {
    try {
      await navigator.clipboard.writeText(JSON.stringify(exportable.map((e) => ({ section: e.section, group: e.group, key: e.key, value: e.value, status: e.status })), null, 2));
      toast(`Copied ${exportable.length} metadata entries. Hidden sensitive values are excluded.`, "ok");
    } catch {
      toast("Copy is not available in this browser context.", "error");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" aria-hidden />
          <input type="search" aria-label="Search metadata keys and values" placeholder="Search keys and values…" value={query} onChange={(e) => setQuery(e.target.value)} className={cx(inputCls, "pl-9")} />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="md" icon={<ChevronsUpDown className="h-4 w-4" />} onClick={() => setOpen(new Set(SECTIONS.map((s) => s.id)))} disabled={raw}>
            Expand all
          </Button>
          <Button size="md" icon={<ChevronsDownUp className="h-4 w-4" />} onClick={() => setOpen(new Set())} disabled={raw}>
            Collapse all
          </Button>
          <Button size="md" icon={<ClipboardCopy className="h-4 w-4" />} onClick={copyAll}>
            Copy all
          </Button>
          <Button size="md" variant={raw ? "primary" : "secondary"} aria-pressed={raw} icon={raw ? <Table2 className="h-4 w-4" /> : <Braces className="h-4 w-4" />} onClick={() => setRaw((r) => !r)}>
            {raw ? "Structured view" : "Raw JSON"}
          </Button>
        </div>
      </div>

      {q && (
        <p role="status" className="text-[13px] text-muted">
          {totalMatches} match{totalMatches === 1 ? "" : "es"} for “{query}”
        </p>
      )}

      {raw ? (
        <Card>
          <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
            <p className="text-[13px] text-muted">{filename}: raw metadata (hidden values shown as “[hidden]”)</p>
            <CopyButton text={json} label="Copy raw JSON" />
          </div>
          <pre tabIndex={0} className="scroll-thin max-h-[560px] overflow-auto p-4 font-mono text-[12px] leading-relaxed text-[#b9c8e6]">
            {json}
          </pre>
        </Card>
      ) : (
        <div className="space-y-3">
          {grouped.map((g) => {
            const isOpen = q ? g.matches.length > 0 : open.has(g.id);
            const empty = g.all.length === 0;
            return (
              <Card key={g.id} as="div">
                <button
                  type="button"
                  aria-expanded={isOpen && !empty}
                  aria-controls={`sec-${g.id}`}
                  disabled={empty}
                  onClick={() => toggle(g.id)}
                  className="flex w-full items-center justify-between gap-3 rounded-[12px] px-4 py-3.5 text-left disabled:cursor-default"
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <ChevronDown className={cx("h-4 w-4 shrink-0 text-faint transition-transform", !(isOpen && !empty) && "-rotate-90")} aria-hidden />
                    <span className="text-sm font-semibold text-fg">{g.title}</span>
                  </span>
                  {empty ? <Badge>None found in file</Badge> : <Badge tone={q ? "cyan" : "blue"}>{q ? `${g.matches.length} of ${g.all.length}` : `${g.all.length} entr${g.all.length === 1 ? "y" : "ies"}`}</Badge>}
                </button>
                {isOpen && !empty && (
                  <div id={`sec-${g.id}`}>
                    {g.matches.map((e, i) => (
                      <EntryRow key={`${e.group}-${e.key}-${i}`} e={e} />
                    ))}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
