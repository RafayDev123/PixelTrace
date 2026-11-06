import type { AnalysisResult, RevealOptions } from "./types";

/** Neutralise spreadsheet formula injection: metadata is untrusted input. */
export function csvCell(value: unknown): string {
  let s = value === null || value === undefined ? "" : Array.isArray(value) ? value.join("; ") : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function row(cells: unknown[]): string {
  return cells.map(csvCell).join(",");
}

/** Per-image metadata CSV. Withheld sensitive rows are omitted entirely. */
export function toMetadataCsv(r: AnalysisResult): string {
  const lines = [row(["analysis_id", "filename", "sha256", "section", "group", "key", "value", "status"])];
  for (const e of r.entries) {
    if (e.masked) continue;
    lines.push(row([r.id, r.file.filename, r.file.sha256, e.section, e.group, e.key, e.value, e.status]));
  }
  return lines.join("\r\n") + "\r\n";
}

export function toReportJson(r: AnalysisResult, reveal: RevealOptions): string {
  const { thumbnail: _t, ...report } = r;
  void _t;
  return JSON.stringify(
    {
      generator: "PixelTrace",
      exportedAt: new Date().toISOString(),
      exportOptions: { includeLocation: reveal.location, includeIdentifiers: reveal.identifiers },
      notice:
        "Sensitive values (GPS coordinates, serial numbers and similar identifiers) are withheld unless explicitly included. Metadata is self-reported by the file and is not proof of authenticity.",
      report,
    },
    null,
    2,
  );
}

function fieldValue(r: AnalysisResult, group: "camera" | "capture", id: string): string {
  return r[group].find((f) => f.id === id)?.value ?? "";
}

export function toBatchCsv(results: AnalysisResult[]): string {
  const lines = [
    row([
      "analysis_id", "filename", "format", "size_bytes", "width", "height", "sha256", "camera_make", "camera_model",
      "date_time_original", "has_gps", "metadata_level", "indicator_count", "top_severity", "duplicate_of_other_analyses",
    ]),
  ];
  const counts = new Map<string, number>();
  for (const r of results) counts.set(r.file.sha256, (counts.get(r.file.sha256) ?? 0) + 1);
  for (const r of results) {
    const top = r.indicators[0]?.severity ?? "informational";
    lines.push(
      row([
        r.id, r.file.filename, r.file.detectedFormat, r.file.sizeBytes, r.file.width, r.file.height, r.file.sha256,
        fieldValue(r, "camera", "make"), fieldValue(r, "camera", "model"), fieldValue(r, "capture", "dateTimeOriginal"),
        r.gps.present ? "yes" : "no", r.availability.level, r.indicators.length, top,
        (counts.get(r.file.sha256) ?? 1) - 1 + r.duplicates.length,
      ]),
    );
  }
  return lines.join("\r\n") + "\r\n";
}

export function toBatchJson(results: AnalysisResult[], reveal: RevealOptions, full: boolean): string {
  const counts = new Map<string, number>();
  for (const r of results) counts.set(r.file.sha256, (counts.get(r.file.sha256) ?? 0) + 1);
  return JSON.stringify(
    {
      generator: "PixelTrace",
      exportedAt: new Date().toISOString(),
      exportOptions: { includeLocation: reveal.location, includeIdentifiers: reveal.identifiers, fullReports: full },
      summary: {
        images: results.length,
        withGps: results.filter((r) => r.gps.present).length,
        withoutExif: results.filter((r) => !r.availability.hasExif).length,
        duplicateGroups: [...counts.values()].filter((n) => n > 1).length,
      },
      items: results.map((r) => {
        const { thumbnail: _t, ...rest } = r;
        void _t;
        return full
          ? rest
          : {
              id: r.id,
              filename: r.file.filename,
              sha256: r.file.sha256,
              format: r.file.detectedFormat,
              dimensions: `${r.file.width}x${r.file.height}`,
              camera: [fieldValue(r, "camera", "make"), fieldValue(r, "camera", "model")].filter(Boolean).join(" ") || null,
              hasGps: r.gps.present,
              metadataLevel: r.availability.level,
              indicators: r.indicators.map((i) => ({ title: i.title, severity: i.severity })),
            };
      }),
    },
    null,
    2,
  );
}

export function safeDownloadName(name: string, ext: string): string {
  const base = name.replace(/\.[A-Za-z0-9]{1,8}$/, "").replace(/[^A-Za-z0-9._-]+/g, "_").slice(0, 80) || "image";
  return `pixeltrace-${base}.${ext}`;
}
