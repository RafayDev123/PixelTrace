"use client";

import { Camera, Clock, FileJson, FileSpreadsheet, FileText, Fingerprint, Flag, ImageOff, Layers, MapPin, ScanLine, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { cameraLabel } from "@/lib/client/format";
import { reportUrl } from "@/lib/client/api";
import type { AnalysisResult, RevealOptions } from "@/lib/types";
import { Alert, Badge, Card, CardHeader, CopyButton, cx, LinkButton, SeverityBadge, TabPanel, Tabs } from "../ui";
import { IndicatorList } from "./IndicatorList";
import { MetadataExplorer } from "./MetadataExplorer";
import { FieldList, LocationPanel, type RevealKind } from "./parts";

type TabId = "overview" | "camera" | "capture" | "location" | "metadata" | "indicators" | "integrity";

function Fact({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5">
      <dt className="shrink-0 text-[12.5px] text-muted">{label}</dt>
      <dd className={cx("min-w-0 break-words text-right text-[13px] text-fg", mono && "font-mono text-[12px]")}>{value}</dd>
    </div>
  );
}

function Summary({ icon, label, value, sub, tone }: { icon: React.ReactNode; label: string; value: string | null; sub?: string; tone?: "ok" | "cyan" }) {
  return (
    <Card as="div" className="p-4">
      <div className="flex items-center gap-2 text-[11.5px] font-medium uppercase tracking-wide text-faint">
        <span className={cx("grid h-6 w-6 place-items-center rounded-md bg-raised", tone === "ok" ? "text-ok" : "text-accent")}>{icon}</span>
        {label}
      </div>
      <p className={cx("mt-2.5 break-words text-[15px] font-semibold leading-snug", value ? "text-fg" : "text-faint italic font-normal")}>{value ?? "Not available in file"}</p>
      {sub && <p className="mt-1 text-[12.5px] leading-snug text-muted">{sub}</p>}
    </Card>
  );
}

function Preview({ r }: { r: AnalysisResult }) {
  return (
    <Card>
      <div className="p-4">
        <div className="marks relative grid min-h-[200px] place-items-center overflow-hidden rounded-lg bg-canvas p-3">
          {r.thumbnail ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={r.thumbnail} alt={`Downscaled preview of ${r.file.filename}`} className="max-h-[320px] w-auto max-w-full rounded object-contain" />
          ) : (
            <div className="flex flex-col items-center gap-2 py-8 text-center text-faint">
              <ImageOff className="h-8 w-8" aria-hidden />
              <p className="max-w-[200px] text-[12.5px]">Preview not stored. The original image is never kept.</p>
            </div>
          )}
        </div>
        <h2 className="mt-4 break-words text-[15px] font-semibold text-fg">{r.file.filename}</h2>
        <dl className="mt-2 divide-y divide-line/60">
          <Fact label="Dimensions" value={`${r.file.width} × ${r.file.height} px`} />
          <Fact label="Format" value={`${r.file.detectedFormat} · ${r.file.mime}`} />
          <Fact label="File size" value={r.file.sizeLabel} />
          <Fact label="Megapixels" value={`${r.file.megapixels} MP`} />
        </dl>
        <div className="mt-3 rounded-lg bg-canvas p-3">
          <div className="flex items-center justify-between">
            <p className="text-[11.5px] font-semibold uppercase tracking-wide text-faint">SHA-256</p>
            <CopyButton text={r.file.sha256} label="Copy SHA-256" />
          </div>
          <p className="mt-1 break-all font-mono text-[11.5px] leading-relaxed text-[#b9c8e6]">{r.file.sha256}</p>
        </div>
      </div>
    </Card>
  );
}

function ExportCard({ id }: { id: string }) {
  const [loc, setLoc] = useState(false);
  const [ident, setIdent] = useState(false);
  const opts: Partial<RevealOptions> = { location: loc, identifiers: ident };
  return (
    <Card>
      <CardHeader title="Export report" />
      <div className="space-y-3 p-4">
        <fieldset>
          <legend className="text-[12px] text-muted">Sensitive data is excluded unless you include it:</legend>
          <label className="mt-2 flex items-center gap-2.5 text-[13px]">
            <input type="checkbox" className="h-4 w-4 accent-[#3d8bff]" checked={loc} onChange={(e) => setLoc(e.target.checked)} /> Include GPS location
          </label>
          <label className="mt-1.5 flex items-center gap-2.5 text-[13px]">
            <input type="checkbox" className="h-4 w-4 accent-[#3d8bff]" checked={ident} onChange={(e) => setIdent(e.target.checked)} /> Include serial numbers
          </label>
        </fieldset>
        <div className="grid grid-cols-3 gap-2">
          <LinkButton size="sm" variant="primary" href={reportUrl(id, "pdf", opts)} download icon={<FileText className="h-3.5 w-3.5" />}>
            PDF
          </LinkButton>
          <LinkButton size="sm" href={reportUrl(id, "json", opts)} download icon={<FileJson className="h-3.5 w-3.5" />}>
            JSON
          </LinkButton>
          <LinkButton size="sm" href={reportUrl(id, "csv", opts)} download icon={<FileSpreadsheet className="h-3.5 w-3.5" />}>
            CSV
          </LinkButton>
        </div>
        {(loc || ident) && <p className="text-[12px] leading-snug text-warn">The exported file will contain sensitive data. Share it carefully.</p>}
      </div>
    </Card>
  );
}

export function ReportView({ result: r, onReveal, onHide }: { result: AnalysisResult; onReveal: (k: RevealKind) => void; onHide: (k: RevealKind) => void }) {
  const [tab, setTab] = useState<TabId>("overview");
  const cam = cameraLabel(r.camera.find((f) => f.id === "make")?.value ?? null, r.camera.find((f) => f.id === "model")?.value ?? null);
  const captured = r.capture.find((f) => f.id === "dateTimeOriginal");
  const top = r.indicators[0]?.severity;
  const serials = r.camera.filter((f) => f.sensitive);
  const idRevealed = serials.some((f) => f.present && !f.masked);
  const rest = r.camera.filter((f) => !f.sensitive);

  const tabs: { id: TabId; label: string; icon: React.ReactNode; badge?: React.ReactNode }[] = [
    { id: "overview", label: "Overview", icon: <Layers className="h-4 w-4" /> },
    { id: "camera", label: "Camera", icon: <Camera className="h-4 w-4" /> },
    { id: "capture", label: "Capture", icon: <Clock className="h-4 w-4" /> },
    { id: "location", label: "Location", icon: <MapPin className="h-4 w-4" /> },
    { id: "metadata", label: "Metadata", icon: <ScanLine className="h-4 w-4" />, badge: <span className="font-mono text-[11px] text-faint">{r.availability.entryCount}</span> },
    { id: "indicators", label: "Forensic Indicators", icon: <Flag className="h-4 w-4" />, badge: <span className="font-mono text-[11px] text-faint">{r.indicators.length}</span> },
    { id: "integrity", label: "File Integrity", icon: <Fingerprint className="h-4 w-4" /> },
  ];

  return (
    <div className="space-y-5">
      <div className="grid gap-5 lg:grid-cols-[340px_1fr]">
        <div className="space-y-5">
          <Preview r={r} />
          <ExportCard id={r.id} />
        </div>
        <div className="space-y-5">
          <section aria-label="Summary" className="grid gap-3 sm:grid-cols-2">
            <Summary icon={<Camera className="h-3.5 w-3.5" />} label="Camera / device" value={cam} sub={cam ? (r.camera.find((f) => f.id === "software")?.value ? `Software: ${r.camera.find((f) => f.id === "software")?.value}` : undefined) : "No make or model recorded. PixelTrace does not guess the device."} />
            <Summary icon={<Clock className="h-3.5 w-3.5" />} label="Original capture time" value={captured?.value ?? null} sub={captured?.value ? captured.note : "Reported separately from file-system time, which uploads do not carry."} />
            <Summary icon={<MapPin className="h-3.5 w-3.5" />} label="Location" value={r.gps.present ? (r.gps.masked ? "GPS present · hidden" : `${r.gps.latitude}, ${r.gps.longitude}`) : "No GPS metadata found"} sub={r.gps.present && r.gps.masked ? "Reveal it in the Location tab." : undefined} tone={r.gps.present ? "cyan" : undefined} />
            <Summary icon={<Layers className="h-3.5 w-3.5" />} label="Metadata availability" value={r.availability.level === "none" ? "No descriptive metadata" : r.availability.level === "limited" ? "Limited metadata" : "Rich metadata"} sub={`${r.availability.entryCount} readable entries · EXIF ${r.availability.hasExif ? "yes" : "no"} · IPTC ${r.availability.hasIptc ? "yes" : "no"} · XMP ${r.availability.hasXmp ? "yes" : "no"}`} />
          </section>
          <Card as="div" className="p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="grid h-9 w-9 place-items-center rounded-lg bg-raised text-accent">
                  <Flag className="h-4 w-4" aria-hidden />
                </span>
                <div>
                  <p className="text-[11.5px] font-medium uppercase tracking-wide text-faint">Forensic indicators</p>
                  <p className="text-[15px] font-semibold text-fg">
                    {r.indicators.length} observation{r.indicators.length === 1 ? "" : "s"}
                    {top && top !== "informational" ? <span className="ml-2 align-middle"><SeverityBadge severity={top} /></span> : null}
                  </p>
                </div>
              </div>
              <button type="button" onClick={() => setTab("indicators")} className="text-[13px] font-medium text-accent hover:text-cyan">
                Review indicators →
              </button>
            </div>
          </Card>
          {!r.persisted && (
            <Alert tone="info" title="Session-only report">
              History is turned off, so this report is deleted automatically after one hour.
            </Alert>
          )}
        </div>
      </div>

      <Card>
        <div className="px-3 sm:px-5">
          <Tabs tabs={tabs} value={tab} onChange={setTab} label="Report sections" />
        </div>
        <div className="px-4 pb-5 sm:px-5">
          <TabPanel id="overview" active={tab === "overview"}>
            <div className="grid gap-5 lg:grid-cols-2">
              <Card as="div" className="bg-panel2">
                <CardHeader title="File properties" subtitle="Verified by PixelTrace from the file itself" />
                <dl className="divide-y divide-line px-5 py-1">
                  <Fact label="Original filename" value={r.file.filename} />
                  <Fact label="Extension" value={r.file.extension ? `.${r.file.extension}` : "none"} />
                  <Fact label="Detected format" value={r.file.detectedFormat} />
                  <Fact label="Aspect ratio" value={r.file.aspectRatio} />
                  <Fact label="Colour mode" value={r.file.colorMode} />
                  <Fact label="Colour profile" value={r.file.colorProfile} />
                  <Fact label="Orientation" value={r.file.orientation} />
                </dl>
              </Card>
              <Card as="div" className="bg-panel2">
                <CardHeader title="Authoring and rights" subtitle="IPTC, XMP and EXIF fields" />
                <FieldList fields={r.authoring} />
              </Card>
            </div>
            <div className="mt-5 rounded-xl border border-line bg-panel2 p-5">
              <h3 className="flex items-center gap-2 text-sm font-semibold">
                <ShieldCheck className="h-4 w-4 text-ok" aria-hidden /> What this report can and cannot tell you
              </h3>
              <ul className="mt-3 list-disc space-y-1.5 pl-5 text-[13.5px] leading-relaxed text-muted">
                {r.limitations.map((l) => (
                  <li key={l}>{l}</li>
                ))}
              </ul>
            </div>
          </TabPanel>

          <TabPanel id="camera" active={tab === "camera"}>
            <Card as="div" className="bg-panel2">
              <CardHeader title="Camera and device" subtitle="Values are exactly what the file records. Missing fields are not guessed." />
              <FieldList fields={rest} />
            </Card>
            <Card as="div" className="mt-4 bg-panel2">
              <CardHeader
                title="Serial numbers"
                subtitle="Unique identifiers: they can link photos to one physical device or owner."
                action={idRevealed ? <Badge tone="warn">Visible</Badge> : <Badge tone="ok">Hidden</Badge>}
              />
              <FieldList fields={serials} onReveal={onReveal} />
              {idRevealed && (
                <div className="border-t border-line px-5 py-3">
                  <button type="button" className="text-[13px] font-medium text-accent hover:text-cyan" onClick={() => onHide("identifiers")}>
                    Hide serial numbers again
                  </button>
                </div>
              )}
            </Card>
          </TabPanel>

          <TabPanel id="capture" active={tab === "capture"}>
            <Alert tone="info">Each timestamp below is a separate claim made by the file. PixelTrace does not merge them into one authoritative capture time.</Alert>
            <Card as="div" className="mt-4 bg-panel2">
              <CardHeader title="Capture information" />
              <FieldList fields={r.capture} />
            </Card>
          </TabPanel>

          <TabPanel id="location" active={tab === "location"}>
            <LocationPanel gps={r.gps} onReveal={() => onReveal("location")} onHide={() => onHide("location")} />
          </TabPanel>

          <TabPanel id="metadata" active={tab === "metadata"}>
            <MetadataExplorer entries={r.entries} filename={r.file.filename} />
          </TabPanel>

          <TabPanel id="indicators" active={tab === "indicators"}>
            <IndicatorList indicators={r.indicators} />
          </TabPanel>

          <TabPanel id="integrity" active={tab === "integrity"}>
            <div className="grid gap-5 lg:grid-cols-2">
              <Card as="div" className="bg-panel2">
                <CardHeader title="File fingerprint" subtitle="SHA-256 of the exact uploaded bytes" />
                <div className="p-5">
                  <div className="flex items-start gap-2 rounded-lg bg-canvas p-3">
                    <p className="min-w-0 flex-1 break-all font-mono text-[12.5px] leading-relaxed text-[#b9c8e6]">{r.file.sha256}</p>
                    <CopyButton text={r.file.sha256} label="Copy SHA-256" />
                  </div>
                  <dl className="mt-4 divide-y divide-line">
                    <Fact label="Size" value={`${r.file.sizeBytes.toLocaleString()} bytes (${r.file.sizeLabel})`} />
                    <Fact label="Bytes after image end" value={String(r.integrity.trailingBytes)} />
                    <Fact label="Embedded thumbnail" value={r.integrity.thumbnail ? `${r.integrity.thumbnail.width}×${r.integrity.thumbnail.height}` : "Not available in file"} />
                    <Fact label="Extension matches content" value={r.file.extensionMatches ? "Yes" : "No"} />
                  </dl>
                </div>
              </Card>
              <Card as="div" className="bg-panel2">
                <CardHeader title="Notes and duplicates" />
                <div className="space-y-4 p-5">
                  <ul className="list-disc space-y-1.5 pl-5 text-[13.5px] leading-relaxed text-muted">
                    {r.integrity.notes.map((n) => (
                      <li key={n}>{n}</li>
                    ))}
                  </ul>
                  <div>
                    <p className="text-[11.5px] font-semibold uppercase tracking-wide text-faint">Identical files analysed earlier</p>
                    {r.duplicates.length ? (
                      <ul className="mt-2 space-y-1.5">
                        {r.duplicates.map((d) => (
                          <li key={d.id} className="text-[13.5px]">
                            <Link href={`/report/${d.id}`} className="text-accent hover:text-cyan">
                              {d.filename}
                            </Link>
                            <span className="text-faint"> · {new Date(d.analyzedAt).toLocaleDateString()}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-1.5 text-[13.5px] italic text-faint">None found</p>
                    )}
                  </div>
                  <div>
                    <p className="text-[11.5px] font-semibold uppercase tracking-wide text-faint">Analysis engine</p>
                    <p className="mt-1 text-[13.5px] text-muted">{r.engine.name}</p>
                    <ul className="mt-1 list-disc space-y-1 pl-5 text-[13px] text-muted">
                      {r.engine.notes.map((n) => (
                        <li key={n}>{n}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </Card>
            </div>
          </TabPanel>
        </div>
      </Card>
    </div>
  );
}
