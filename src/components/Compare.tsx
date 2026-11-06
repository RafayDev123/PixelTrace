"use client";

import { cameraLabel, shortHash } from "@/lib/client/format";
import type { AnalysisResult } from "@/lib/types";
import { Badge, Card, CardHeader, cx } from "./ui";

const field = (r: AnalysisResult, group: "camera" | "capture", id: string): string | null => r[group].find((f) => f.id === id)?.value ?? null;

interface Row {
  label: string;
  values: (string | null)[];
}

function rowsFor(results: AnalysisResult[]): Row[] {
  const r = (label: string, fn: (x: AnalysisResult) => string | null): Row => ({ label, values: results.map(fn) });
  return [
    r("Format", (x) => x.file.detectedFormat),
    r("Dimensions", (x) => `${x.file.width}×${x.file.height}`),
    r("File size", (x) => x.file.sizeLabel),
    r("SHA-256", (x) => shortHash(x.file.sha256)),
    r("Camera", (x) => cameraLabel(field(x, "camera", "make"), field(x, "camera", "model"))),
    r("Lens", (x) => field(x, "camera", "lensModel")),
    r("Software", (x) => field(x, "camera", "software")),
    r("Original capture time", (x) => field(x, "capture", "dateTimeOriginal")),
    r("Metadata modified", (x) => field(x, "capture", "modifyDate")),
    r("Exposure", (x) => [field(x, "capture", "exposureTime"), field(x, "capture", "aperture"), field(x, "capture", "iso") && `ISO ${field(x, "capture", "iso")}`].filter(Boolean).join(" · ") || null),
    r("GPS coordinates", (x) => (x.gps.present ? "Present (hidden)" : "Not found")),
    r("Metadata level", (x) => x.availability.level),
    r("Indicators", (x) => `${x.indicators.length} (top: ${x.indicators[0]?.severity ?? "none"})`),
  ];
}

export function CompareTable({ results }: { results: AnalysisResult[] }) {
  const rows = rowsFor(results);
  return (
    <Card>
      <CardHeader title="Metadata comparison" subtitle="Rows that differ between the selected images are highlighted. A difference is an observation, not a conclusion." />
      <div className="scroll-thin overflow-x-auto">
        <table className="w-full min-w-[560px] border-collapse text-left text-[13px]">
          <caption className="sr-only">Metadata comparison between selected images</caption>
          <thead>
            <tr className="border-b border-line">
              <th scope="col" className="sticky left-0 bg-panel px-4 py-3 text-[11.5px] font-medium uppercase tracking-wide text-faint">
                Field
              </th>
              {results.map((x) => (
                <th key={x.id} scope="col" className="max-w-[220px] px-4 py-3 font-medium text-fg">
                  <span className="block truncate" title={x.file.filename}>
                    {x.file.filename}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const distinct = new Set(row.values.map((v) => v ?? "—")).size > 1;
              return (
                <tr key={row.label} className={cx("border-b border-line/60 last:border-0", distinct && "bg-[#13203b]")}>
                  <th scope="row" className={cx("sticky left-0 px-4 py-2.5 font-medium text-muted", distinct ? "bg-[#13203b]" : "bg-panel")}>
                    <span className="flex items-center gap-2">
                      {row.label}
                      {distinct && <Badge tone="cyan">differs</Badge>}
                    </span>
                  </th>
                  {row.values.map((v, i) => (
                    <td key={i} className={cx("px-4 py-2.5 align-top", v ? "text-fg" : "italic text-faint")}>
                      {v ?? "Not available in file"}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
