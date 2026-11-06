import { describe, expect, it } from "vitest";
import { aspectRatio, buildAnalysis, sha256Hex, trailingBytes } from "@/lib/analyze";
import { parseExifDate } from "@/lib/dates";
import { csvCell, toBatchCsv, toMetadataCsv, toReportJson } from "@/lib/exports";
import { dmsToDecimal, extractMetadata, parseXmpLite } from "@/lib/extract";
import { runIndicators } from "@/lib/indicators";
import { maskResult } from "@/lib/mask";
import { buildPdf } from "@/lib/pdf";
import { validateImage } from "@/lib/validate";
import type { AnalysisResult } from "@/lib/types";
import { EXIF_FULL, makeImage } from "./fixtures";

const ctx = { persisted: true, duplicates: async () => [] };
async function analyze(buf: Buffer, filename = "test.jpg"): Promise<AnalysisResult> {
  return (await buildAnalysis({ filename, buffer: buf }, ctx)).result;
}

describe("validation", () => {
  it.each(["jpeg", "png", "webp", "tiff"] as const)("accepts a valid %s", async (fmt) => {
    const v = await validateImage(await makeImage(fmt));
    expect(v.format).toBe(fmt);
    expect(v.width).toBe(64);
    expect(v.height).toBe(48);
  });
  it("rejects arbitrary text renamed to .jpg", async () => {
    await expect(validateImage(Buffer.from("this is definitely not an image file"))).rejects.toMatchObject({ code: "unsupported_format", status: 415 });
  });
  it("rejects truncated / corrupted JPEG data", async () => {
    const good = await makeImage("jpeg", { width: 400, height: 400 });
    const bad = Buffer.concat([good.subarray(0, 300), Buffer.alloc(40, 7)]);
    await expect(validateImage(bad)).rejects.toMatchObject({ code: "corrupted_image" });
  });
  it("rejects SVG, ZIP and executable content", async () => {
    await expect(validateImage(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'))).rejects.toMatchObject({ code: "active_content_rejected" });
    await expect(validateImage(Buffer.concat([Buffer.from([0x50, 0x4b, 3, 4]), Buffer.alloc(40)]))).rejects.toMatchObject({ code: "archive_rejected" });
    await expect(validateImage(Buffer.concat([Buffer.from("MZ"), Buffer.alloc(40)]))).rejects.toMatchObject({ code: "active_content_rejected" });
  });
  it("reports HEIC as unsupported", async () => {
    const heic = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from("ftypheic"), Buffer.alloc(32)]);
    await expect(validateImage(heic)).rejects.toMatchObject({ code: "heic_unsupported" });
  });
  it("rejects oversized and empty files", async () => {
    await expect(validateImage(Buffer.alloc(21 * 1024 * 1024))).rejects.toMatchObject({ code: "file_too_large", status: 413 });
    await expect(validateImage(Buffer.alloc(0))).rejects.toMatchObject({ code: "empty_file" });
  });
});

describe("hashing and helpers", () => {
  it("computes SHA-256 correctly", () => {
    expect(sha256Hex(Buffer.from("abc"))).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
  it("identical bytes yield identical hashes", async () => {
    const a = await makeImage("png");
    expect(sha256Hex(a)).toBe(sha256Hex(Buffer.from(a)));
  });
  it("simplifies aspect ratios", () => expect(aspectRatio(64, 48)).toBe("4:3"));
  it("detects trailing data after JPEG end", async () => {
    const j = await makeImage("jpeg");
    expect(trailingBytes(j, "jpeg")).toBe(0);
    expect(trailingBytes(Buffer.concat([j, Buffer.alloc(100, 1)]), "jpeg")).toBe(100);
  });
  it("converts DMS to decimal with hemisphere", () => {
    expect(dmsToDecimal([51, 30, 0], "N")).toBe(51.5);
    expect(dmsToDecimal([0, 7, 30], "W")).toBe(-0.125);
    expect(dmsToDecimal([33, 51, 54], "S")).toBeCloseTo(-33.865, 3);
  });
  it("parses EXIF dates and rejects placeholders", () => {
    expect(parseExifDate("2024:03:05 14:00:00")).not.toBeNull();
    expect(parseExifDate("0000:00:00 00:00:00")).toBeNull();
    expect(parseExifDate("garbage")).toBeNull();
  });
  it("parses XMP without executing anything", () => {
    const x = parseXmpLite('<x:xmpmeta><rdf:Description xmp:CreatorTool="GIMP 2.10" /><dc:creator><rdf:Seq><rdf:li>Ann</rdf:li></rdf:Seq></dc:creator></x:xmpmeta>');
    expect(x.CreatorTool).toBe("GIMP 2.10");
    expect(x.creator).toEqual(["Ann"]);
  });
});

describe("metadata extraction", () => {
  it("reads camera, capture and GPS metadata from JPEG", async () => {
    const e = await extractMetadata(await makeImage("jpeg", { exif: EXIF_FULL }), "jpeg");
    expect(e.camera.find((f) => f.id === "make")?.value).toBe("TestCam");
    expect(e.camera.find((f) => f.id === "model")?.value).toBe("Synth 1");
    expect(e.capture.find((f) => f.id === "dateTimeOriginal")?.value).toContain("2024-03-05 14:00:00");
    expect(e.capture.find((f) => f.id === "aperture")?.value).toBe("f/2.8");
    expect(e.capture.find((f) => f.id === "exposureTime")?.value).toBe("1/250 s");
    expect(e.gps.present).toBe(true);
    expect(e.gps.latitude).toBe(51.5);
    expect(e.gps.longitude).toBe(-0.125);
    expect(e.flags.hasExif).toBe(true);
  });
  it("reads EXIF from PNG and WebP", async () => {
    for (const fmt of ["png", "webp"] as const) {
      const e = await extractMetadata(await makeImage(fmt, { exif: EXIF_FULL }), fmt);
      expect(e.camera.find((f) => f.id === "make")?.value, fmt).toBe("TestCam");
    }
  });
  it("parses TIFF structure without failing (sharp cannot write EXIF into TIFF fixtures)", async () => {
    const e = await extractMetadata(await makeImage("tiff"), "tiff");
    expect(e.parserFailed).toBe(false);
    expect(e.flags.hasExif).toBe(false);
  });
  it("reports missing EXIF honestly", async () => {
    const e = await extractMetadata(await makeImage("png"), "png");
    expect(e.flags.hasExif).toBe(false);
    expect(e.gps.present).toBe(false);
    expect(e.camera.find((f) => f.id === "make")?.present).toBe(false);
  });
  it("flags serial numbers and GPS entries as sensitive", async () => {
    const e = await extractMetadata(await makeImage("jpeg", { exif: EXIF_FULL }), "jpeg");
    expect(e.entries.filter((x) => x.group === "GPS").every((x) => x.sensitive)).toBe(true);
    expect(e.entries.find((x) => /serial/i.test(x.key))?.sensitive).toBe(true);
  });
});

describe("forensic indicators", () => {
  it("explains missing metadata without alarm", async () => {
    const r = await analyze(await makeImage("png"), "shot.png");
    const ids = r.indicators.map((i) => i.id);
    expect(ids).toContain("no-exif");
    expect(ids).toContain("no-camera");
    expect(ids).toContain("no-gps");
    expect(r.indicators.every((i) => i.severity === "informational")).toBe(true);
    for (const i of r.indicators) {
      expect(i.triggeredBy.length).toBeGreaterThan(10);
      expect(i.limitation.length).toBeGreaterThan(10);
      expect(i.recommendation.length).toBeGreaterThan(10);
    }
  });
  it("records editing software, timestamp difference and GPS presence", async () => {
    const r = await analyze(await makeImage("jpeg", { exif: EXIF_FULL }));
    const ids = r.indicators.map((i) => i.id);
    expect(ids).toContain("editing-software");
    expect(ids).toContain("modified-after-capture");
    expect(ids).toContain("gps-present");
    expect(r.indicators.find((i) => i.id === "editing-software")?.limitation).toMatch(/does not prove/);
  });
  it("flags extension mismatch", async () => {
    const r = await analyze(await makeImage("png"), "photo.jpg");
    expect(r.indicators.map((i) => i.id)).toContain("extension-mismatch");
  });
  it("flags modify-before-original and reaches High only through converging mediums", async () => {
    const exif = { IFD0: { Make: "A", Model: "B", Software: "GIMP 2.10", DateTime: "2020:01:01 10:00:00" }, IFD2: { DateTimeOriginal: "2024:03:05 14:00:00" } };
    const r = await analyze(await makeImage("jpeg", { exif }));
    const ids = r.indicators.map((i) => i.id);
    expect(ids).toContain("modify-before-original");
    expect(ids).toContain("editing-software");
    expect(r.indicators[0].id).toBe("multiple-anomalies");
    expect(r.indicators[0].severity).toBe("high");
  });
  it("flags thumbnail aspect-ratio mismatch (rule level)", async () => {
    const r = await analyze(await makeImage("jpeg"));
    const out = runIndicators({
      file: r.file, entries: r.entries, gps: r.gps, hasExif: false, thumbnail: { width: 160, height: 160 },
      trailingBytes: 0, duplicates: [],
    });
    expect(out.map((i) => i.id)).toContain("thumbnail-mismatch");
  });
  it("detects duplicates by SHA-256", async () => {
    const buf = await makeImage("png");
    const first = (await buildAnalysis({ filename: "a.png", buffer: buf }, ctx)).result;
    const second = (
      await buildAnalysis({ filename: "b.png", buffer: buf }, { persisted: true, duplicates: async () => [{ id: first.id, filename: "a.png", analyzedAt: first.analyzedAt }] })
    ).result;
    expect(second.file.sha256).toBe(first.file.sha256);
    expect(second.indicators.map((i) => i.id)).toContain("duplicate-hash");
  });
});

describe("privacy masking", () => {
  it("hides GPS and serial numbers by default and reveals on request", async () => {
    const full = await analyze(await makeImage("jpeg", { exif: EXIF_FULL }));
    const hidden = maskResult(full);
    expect(hidden.gps.latitude).toBeNull();
    expect(hidden.gps.longitude).toBeNull();
    expect(hidden.gps.present).toBe(true);
    expect(hidden.gps.masked).toBe(true);
    expect(JSON.stringify(hidden)).not.toContain("SN-TEST-123");
    expect(JSON.stringify(hidden)).not.toContain("51.5");
    expect(hidden.camera.find((f) => f.id === "serial")?.masked).toBe(true);
    const shown = maskResult(full, { location: true, identifiers: true });
    expect(shown.gps.latitude).toBe(51.5);
    expect(shown.camera.find((f) => f.id === "serial")?.value).toBe("SN-TEST-123");
    const onlyLoc = maskResult(full, { location: true, identifiers: false });
    expect(onlyLoc.gps.latitude).toBe(51.5);
    expect(JSON.stringify(onlyLoc)).not.toContain("SN-TEST-123");
  });
});

describe("exports", () => {
  it("exports JSON without sensitive values by default", async () => {
    const r = maskResult(await analyze(await makeImage("jpeg", { exif: EXIF_FULL })));
    const json = toReportJson(r, { location: false, identifiers: false });
    const parsed = JSON.parse(json);
    expect(parsed.report.file.sha256).toHaveLength(64);
    expect(json).not.toContain("SN-TEST-123");
    expect(parsed.exportOptions.includeLocation).toBe(false);
  });
  it("exports CSV, omitting withheld rows and neutralising formulas", async () => {
    const r = maskResult(await analyze(await makeImage("jpeg", { exif: EXIF_FULL })));
    const csv = toMetadataCsv(r);
    expect(csv.split("\r\n")[0]).toBe("analysis_id,filename,sha256,section,group,key,value,status");
    expect(csv).toContain("TestCam");
    expect(csv).not.toContain("SN-TEST-123");
    expect(csv).not.toContain("GPSLatitude");
    expect(csvCell("=HYPERLINK(\"http://x\")")).toBe('"\'=HYPERLINK(""http://x"")"');
    expect(csvCell("+1")).toBe("'+1");
  });
  it("builds batch CSV", async () => {
    const a = await analyze(await makeImage("png"), "a.png");
    const csv = toBatchCsv([a]);
    expect(csv).toContain("a.png");
    expect(csv.split("\r\n")).toHaveLength(3);
  });
  it("generates a valid PDF, with and without sensitive fields", async () => {
    const full = await analyze(await makeImage("jpeg", { exif: EXIF_FULL }));
    const plain = await buildPdf(maskResult(full), { location: false, identifiers: false });
    const revealed = await buildPdf(maskResult(full, { location: true, identifiers: true }), { location: true, identifiers: true });
    for (const pdf of [plain, revealed]) {
      expect(Buffer.from(pdf.subarray(0, 5)).toString()).toBe("%PDF-");
      expect(pdf.length).toBeGreaterThan(3000);
    }
    expect(revealed.length).toBeGreaterThan(plain.length - 1);
  });
});
