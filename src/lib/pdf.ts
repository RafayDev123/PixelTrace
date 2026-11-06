import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import type { AnalysisResult, Field, RevealOptions } from "./types";

const W = 595.28;
const H = 841.89;
const M = 48;
const INK = rgb(0.09, 0.11, 0.16);
const MUTED = rgb(0.38, 0.43, 0.52);
const ACCENT = rgb(0.0, 0.55, 0.85);
const NAVY = rgb(0.04, 0.07, 0.13);
const SEV_COLOR = {
  informational: rgb(0.3, 0.45, 0.65),
  low: rgb(0.1, 0.55, 0.55),
  medium: rgb(0.78, 0.5, 0.0),
  high: rgb(0.75, 0.15, 0.15),
};

/** pdf-lib standard fonts only support WinAnsi; replace everything else. */
export function pdfSafe(input: string): string {
  return input
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\u2026/g, "...")
    .replace(/[^\x20-\x7e\xa0-\xff]/g, "?");
}

class Layout {
  page!: PDFPage;
  y = 0;
  pageNo = 0;
  constructor(
    private pdf: PDFDocument,
    private font: PDFFont,
    private bold: PDFFont,
    private mono: PDFFont,
    private title: string,
  ) {
    this.newPage();
  }

  newPage() {
    this.page = this.pdf.addPage([W, H]);
    this.pageNo += 1;
    // header band with brand mark
    this.page.drawRectangle({ x: 0, y: H - 40, width: W, height: 40, color: NAVY });
    const cx = M + 8;
    const cy = H - 20;
    this.page.drawCircle({ x: cx, y: cy, size: 8, borderColor: rgb(0.2, 0.8, 1), borderWidth: 1.5 });
    this.page.drawCircle({ x: cx, y: cy, size: 2.5, color: rgb(0.2, 0.8, 1) });
    this.page.drawText("PixelTrace", { x: M + 24, y: H - 24, size: 12, font: this.bold, color: rgb(1, 1, 1) });
    this.page.drawText("Image Intelligence & Metadata Report", { x: W - M - 190, y: H - 24, size: 8, font: this.font, color: rgb(0.6, 0.75, 0.9) });
    this.page.drawText(`Page ${this.pageNo}`, { x: W - M - 30, y: 24, size: 8, font: this.font, color: MUTED });
    this.page.drawText(pdfSafe(this.title).slice(0, 70), { x: M, y: 24, size: 8, font: this.font, color: MUTED });
    this.y = H - 70;
  }

  ensure(h: number) {
    if (this.y - h < 50) this.newPage();
  }

  wrap(text: string, font: PDFFont, size: number, width: number): string[] {
    const lines: string[] = [];
    for (const para of pdfSafe(text).split(/\r?\n/)) {
      let line = "";
      for (const word of para.split(/\s+/).filter(Boolean)) {
        let w = word;
        while (font.widthOfTextAtSize(w, size) > width) {
          // break very long tokens (hashes) by character
          let cut = w.length;
          while (cut > 1 && font.widthOfTextAtSize(w.slice(0, cut), size) > width) cut--;
          if (line) {
            lines.push(line);
            line = "";
          }
          lines.push(w.slice(0, cut));
          w = w.slice(cut);
        }
        const test = line ? `${line} ${w}` : w;
        if (font.widthOfTextAtSize(test, size) <= width) line = test;
        else {
          lines.push(line);
          line = w;
        }
      }
      lines.push(line);
    }
    return lines;
  }

  text(text: string, o: { size?: number; bold?: boolean; mono?: boolean; color?: ReturnType<typeof rgb>; indent?: number; width?: number } = {}) {
    const size = o.size ?? 9.5;
    const font = o.mono ? this.mono : o.bold ? this.bold : this.font;
    const width = (o.width ?? W - 2 * M) - (o.indent ?? 0);
    for (const line of this.wrap(text, font, size, width)) {
      this.ensure(size + 4);
      this.page.drawText(line, { x: M + (o.indent ?? 0), y: this.y, size, font, color: o.color ?? INK });
      this.y -= size + 3.5;
    }
  }

  heading(text: string) {
    this.ensure(40);
    this.y -= 10;
    this.page.drawRectangle({ x: M, y: this.y - 2, width: 3, height: 14, color: ACCENT });
    this.page.drawText(pdfSafe(text), { x: M + 10, y: this.y, size: 12, font: this.bold, color: INK });
    this.y -= 22;
  }

  kv(label: string, value: string | null, o: { mono?: boolean; note?: string } = {}) {
    const labelW = 150;
    const size = 9.5;
    const valueLines = this.wrap(value ?? "Not available in file", o.mono ? this.mono : this.font, size, W - 2 * M - labelW - 8);
    this.ensure(valueLines.length * 13 + 4);
    this.page.drawText(pdfSafe(label), { x: M, y: this.y, size: 9, font: this.font, color: MUTED });
    valueLines.forEach((l, i) => {
      this.page.drawText(l, {
        x: M + labelW, y: this.y - i * 13, size, font: o.mono ? this.mono : this.font,
        color: value === null ? MUTED : INK,
      });
    });
    this.y -= valueLines.length * 13 + 2;
    if (o.note) this.text(o.note, { size: 8, color: MUTED, indent: labelW });
  }

  fields(fields: Field[]) {
    for (const f of fields) {
      if (f.sensitive) continue; // sensitive fields are handled explicitly by the caller
      this.kv(f.label, f.value, f.note ? { note: f.note } : {});
    }
  }

  gap(n = 6) {
    this.y -= n;
  }
}

function dataUrlToBytes(url: string | null | undefined): Uint8Array | null {
  const m = url ? /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(url) : null;
  return m ? new Uint8Array(Buffer.from(m[1], "base64")) : null;
}

export async function buildPdf(r: AnalysisResult, reveal: RevealOptions): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`PixelTrace report - ${pdfSafe(r.file.filename)}`);
  pdf.setProducer("PixelTrace");
  pdf.setCreator("PixelTrace");
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const mono = await pdf.embedFont(StandardFonts.Courier);
  const L = new Layout(pdf, font, bold, mono, r.file.filename);

  L.text("Image metadata analysis report", { size: 20, bold: true });
  L.text(r.file.filename, { size: 11, color: MUTED });
  L.gap(4);
  L.text(`Analysis date: ${new Date(r.analyzedAt).toUTCString()}    Report ID: ${r.id}`, { size: 8.5, color: MUTED });
  L.gap(8);

  // Preview + file info
  let preview: PDFImage | null = null;
  const bytes = dataUrlToBytes(r.thumbnail);
  if (bytes) {
    try {
      preview = await pdf.embedJpg(bytes);
    } catch {
      preview = null;
    }
  }
  if (preview) {
    const scale = Math.min(170 / preview.width, 130 / preview.height, 1);
    const w = preview.width * scale;
    const h = preview.height * scale;
    L.ensure(h + 10);
    L.page.drawRectangle({ x: M - 1, y: L.y - h - 1, width: w + 2, height: h + 2, borderColor: rgb(0.8, 0.84, 0.9), borderWidth: 0.8 });
    L.page.drawImage(preview, { x: M, y: L.y - h, width: w, height: h });
    L.page.drawText("Preview (downscaled)", { x: M, y: L.y - h - 12, size: 7.5, font, color: MUTED });
    const startY = L.y;
    const lines: [string, string][] = [
      ["Format", `${r.file.detectedFormat} (${r.file.mime})`],
      ["Dimensions", `${r.file.width} x ${r.file.height} px (${r.file.megapixels} MP)`],
      ["File size", `${r.file.sizeLabel} (${r.file.sizeBytes.toLocaleString("en-US")} bytes)`],
      ["Color mode", r.file.colorMode],
    ];
    let yy = startY - 8;
    for (const [k, v] of lines) {
      L.page.drawText(k, { x: M + w + 24, y: yy, size: 8.5, font, color: MUTED });
      L.page.drawText(pdfSafe(v).slice(0, 48), { x: M + w + 24 + 70, y: yy, size: 9, font, color: INK });
      yy -= 15;
    }
    L.y = startY - h - 24;
  }

  L.heading("File information");
  L.kv("Original filename", r.file.filename);
  if (!preview) {
    L.kv("Format", `${r.file.detectedFormat} (${r.file.mime})`);
    L.kv("Dimensions", `${r.file.width} x ${r.file.height} px (${r.file.megapixels} MP)`);
    L.kv("File size", `${r.file.sizeLabel} (${r.file.sizeBytes.toLocaleString("en-US")} bytes)`);
  }
  L.kv("Aspect ratio", r.file.aspectRatio);
  L.kv("Orientation", r.file.orientation);
  L.kv("Colour profile", r.file.colorProfile);
  L.kv("SHA-256", r.file.sha256, { mono: true });

  L.heading("Camera and device");
  L.fields(r.camera);
  const serials = r.camera.filter((f) => f.sensitive && f.present);
  if (reveal.identifiers) {
    for (const f of serials) L.kv(f.label, f.value);
    if (!serials.length) L.kv("Serial numbers", null);
  } else if (serials.length) {
    L.text("Serial numbers are present in the file but were not included in this export (excluded by default).", { size: 8.5, color: MUTED });
  }

  L.heading("Capture information");
  L.fields(r.capture);
  L.text("Each timestamp is reported separately as recorded. They are not merged into a single authoritative capture time.", { size: 8, color: MUTED });

  L.heading("GPS location");
  if (!r.gps.present) L.text("GPS location metadata was not found in this image.");
  else if (!reveal.location) L.text("GPS coordinates are present in the file but were not included in this export (excluded by default).", { color: MUTED });
  else {
    L.kv("Latitude", r.gps.latitude === null ? null : String(r.gps.latitude));
    L.kv("Longitude", r.gps.longitude === null ? null : String(r.gps.longitude));
    L.kv("Altitude", r.gps.altitude);
    L.kv("GPS timestamp", r.gps.timestamp);
    L.kv("Direction", r.gps.direction);
    L.kv("Speed", r.gps.speed);
    L.text("Coordinates are device-reported and not independently verified.", { size: 8, color: MUTED });
  }

  L.heading("Authoring and rights (IPTC / XMP / EXIF)");
  L.fields(r.authoring);

  L.heading("Metadata availability");
  L.kv("Overall level", r.availability.level);
  L.kv("EXIF / IPTC / XMP / ICC", [r.availability.hasExif, r.availability.hasIptc, r.availability.hasXmp, r.availability.hasIcc].map((b) => (b ? "yes" : "no")).join(" / "));
  L.kv("Readable entries", String(r.availability.entryCount));

  L.heading("Important metadata");
  const important = r.entries.filter((e) => !e.masked && e.status === "present" && ["camera", "capture", "iptc", "xmp"].includes(e.section)).slice(0, 40);
  if (!important.length) L.text("No camera, capture, IPTC or XMP metadata entries were found.", { color: MUTED });
  for (const e of important) L.kv(`${e.group}: ${e.key}`.slice(0, 34), Array.isArray(e.value) ? e.value.join(", ") : String(e.value));

  L.heading("Forensic indicators");
  L.text("Rule-based metadata observations for manual review. Severity categories are not probabilities and do not declare any image authentic or manipulated.", { size: 8.5, color: MUTED });
  L.gap(4);
  for (const ind of r.indicators) {
    L.ensure(70);
    L.page.drawRectangle({ x: M, y: L.y - 3, width: 52, height: 13, color: SEV_COLOR[ind.severity] });
    L.page.drawText(ind.severity.toUpperCase(), { x: M + 4, y: L.y, size: 7.5, font: bold, color: rgb(1, 1, 1) });
    L.page.drawText(pdfSafe(ind.title).slice(0, 80), { x: M + 60, y: L.y, size: 10, font: bold, color: INK });
    L.y -= 16;
    L.text(ind.description, { indent: 6 });
    for (const ev of ind.evidence) L.text(`Evidence - ${ev.field}: ${ev.masked ? "[withheld]" : ev.value ?? "n/a"}`, { size: 8.5, mono: false, color: MUTED, indent: 6 });
    L.text(`Why it triggered: ${ind.triggeredBy}`, { size: 8.5, indent: 6 });
    L.text(`Why it matters: ${ind.why}`, { size: 8.5, indent: 6 });
    L.text(`Limitation: ${ind.limitation}`, { size: 8.5, indent: 6 });
    L.text(`Recommendation: ${ind.recommendation}`, { size: 8.5, indent: 6 });
    L.gap(6);
  }

  L.heading("File integrity");
  L.kv("SHA-256", r.file.sha256, { mono: true });
  for (const n of r.integrity.notes) L.text(`- ${n}`, { size: 8.5 });

  L.heading("Limitations and interpretation notes");
  for (const l of r.limitations) L.text(`- ${l}`, { size: 8.5 });
  L.text(`- Metadata engine: ${r.engine.name}.`, { size: 8.5 });
  for (const n of r.engine.notes) L.text(`- ${n}`, { size: 8.5 });

  return pdf.save();
}
