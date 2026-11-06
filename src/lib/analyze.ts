import { createHash, randomUUID } from "node:crypto";
import { extractMetadata, informativeCount } from "./extract";
import { runIndicators } from "./indicators";
import { maskResult } from "./mask";
import type { AnalysisResult, DuplicateRef, FileInfo, MetaEntry, MetadataLevel } from "./types";
import { extensionOf, FORMAT_INFO, sanitizeFilename, validateImage } from "./validate";

export function sha256Hex(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

export function aspectRatio(w: number, h: number): string {
  const g = gcd(w, h);
  const a = w / g;
  const b = h / g;
  if (a <= 32 && b <= 32) return `${a}:${b}`;
  return `${(w / h).toFixed(2)}:1`;
}

const ORIENTATIONS: Record<number, string> = {
  1: "Horizontal (normal)", 2: "Mirrored horizontal", 3: "Rotated 180°", 4: "Mirrored vertical",
  5: "Mirrored horizontal, rotated 270° CW", 6: "Rotated 90° CW", 7: "Mirrored horizontal, rotated 90° CW", 8: "Rotated 270° CW",
};

/** Bytes remaining after the final end-of-image marker (JPEG) or IEND chunk (PNG). */
export function trailingBytes(buf: Buffer, format: string): number {
  if (format === "jpeg") {
    const idx = buf.lastIndexOf(Buffer.from([0xff, 0xd9]));
    return idx === -1 ? 0 : buf.length - (idx + 2);
  }
  if (format === "png") {
    const idx = buf.lastIndexOf(Buffer.from("IEND", "latin1"));
    return idx === -1 ? 0 : Math.max(0, buf.length - (idx + 8));
  }
  return 0;
}

function generalEntries(file: FileInfo, extra: { channels: number; depth: string; density: number | null; hasAlpha: boolean }): MetaEntry[] {
  const e = (section: "general" | "technical", group: string, key: string, value: string | number | boolean | null): MetaEntry => ({
    section, group, key, value, status: value === null || value === "" ? "empty" : "present", sensitive: false,
  });
  const G = "File (computed by PixelTrace)";
  const D = "Image decoder";
  return [
    e("general", G, "Filename", file.filename),
    e("general", G, "FileExtension", file.extension || null),
    e("general", G, "DetectedFormat", file.detectedFormat),
    e("general", G, "MIMEType", file.mime),
    e("general", G, "FileSizeBytes", file.sizeBytes),
    e("general", G, "FileSize", file.sizeLabel),
    e("general", G, "ImageWidth", file.width),
    e("general", G, "ImageHeight", file.height),
    e("general", G, "AspectRatio", file.aspectRatio),
    e("general", G, "Megapixels", file.megapixels),
    e("general", G, "ColorMode", file.colorMode),
    e("general", G, "ColorProfile", file.colorProfile),
    e("general", G, "Orientation", file.orientation),
    e("general", G, "SHA-256", file.sha256),
    e("technical", D, "Channels", extra.channels),
    e("technical", D, "BitDepth", extra.depth),
    e("technical", D, "HasAlphaChannel", extra.hasAlpha),
    e("technical", D, "PixelDensity (px/inch)", extra.density),
  ];
}

export interface AnalyzeInput {
  filename: string;
  buffer: Buffer;
  sessionId?: string;
}

/**
 * Pure analysis pipeline (no database): validate → hash → extract → indicators.
 * All processing happens in memory; no temporary files are written, so there is nothing to clean up.
 * Returns the UNMASKED result plus the preview thumbnail; callers must mask before sending.
 */
export async function buildAnalysis(
  input: AnalyzeInput,
  ctx: { persisted: boolean; duplicates: (sha256: string, sessionId: string) => Promise<DuplicateRef[]> },
): Promise<{ result: AnalysisResult; thumbnail: string }> {
  const filename = sanitizeFilename(input.filename);
  const validated = await validateImage(input.buffer);
  const sha = sha256Hex(input.buffer);
  const extraction = await extractMetadata(input.buffer, validated.format);

  const ext = extensionOf(filename);
  const info = FORMAT_INFO[validated.format];
  const sessionId = input.sessionId ?? randomUUID();
  const exifOrientation = extraction.entries.find((e) => e.key === "Orientation" && (e.group === "IFD0" || e.group === "EXIF"));
  const spaceLabel = validated.space === "srgb" ? "sRGB" : validated.space === "b-w" ? "Greyscale" : validated.space.toUpperCase();

  const file: FileInfo = {
    filename,
    extension: ext,
    detectedFormat: info.label,
    mime: info.mime,
    sizeBytes: input.buffer.length,
    sizeLabel: formatBytes(input.buffer.length),
    width: validated.width,
    height: validated.height,
    aspectRatio: aspectRatio(validated.width, validated.height),
    megapixels: Math.round((validated.width * validated.height) / 1e4) / 100,
    colorMode: `${spaceLabel}${validated.hasAlpha ? " + alpha" : ""} (${validated.channels} channels)`,
    colorProfile: extraction.iccDescription ?? (validated.hasProfile ? "Embedded ICC profile (name not readable)" : "No embedded profile"),
    orientation: typeof exifOrientation?.value === "string" ? exifOrientation.value : ORIENTATIONS[validated.orientation] ?? "Unknown",
    sha256: sha,
    extensionMatches: ext === "" ? true : info.extensions.includes(ext),
  };

  const entries = [...generalEntries(file, validated), ...extraction.entries];
  const duplicates = await ctx.duplicates(sha, sessionId);
  const trailing = trailingBytes(input.buffer, validated.format);
  const indicators = runIndicators({
    file,
    entries,
    gps: extraction.gps,
    hasExif: extraction.flags.hasExif,
    thumbnail: extraction.thumbnail,
    trailingBytes: trailing,
    duplicates,
  });

  const informative = informativeCount(extraction.entries);
  const level: MetadataLevel = informative === 0 ? "none" : informative < 10 ? "limited" : "rich";
  const integrityNotes: string[] = [
    "The SHA-256 fingerprint identifies these exact bytes. Any re-save, resize or metadata edit produces a different hash.",
    "A hash proves the file is unchanged only relative to another trusted copy of its hash.",
  ];
  if (trailing > 0) integrityNotes.push(`${trailing.toLocaleString()} bytes were found after the image end marker.`);
  if (extraction.thumbnail) integrityNotes.push(`An embedded thumbnail (${extraction.thumbnail.width}×${extraction.thumbnail.height}) was found and compared with the main image.`);
  else integrityNotes.push("No embedded thumbnail was available to compare.");

  const persisted = ctx.persisted;
  const result: AnalysisResult = {
    id: randomUUID(),
    sessionId,
    analyzedAt: new Date().toISOString(),
    file,
    camera: extraction.camera,
    capture: extraction.capture,
    authoring: extraction.authoring,
    gps: extraction.gps,
    entries,
    indicators,
    duplicates,
    availability: {
      level,
      hasExif: extraction.flags.hasExif,
      hasIptc: extraction.flags.hasIptc,
      hasXmp: extraction.flags.hasXmp,
      hasIcc: extraction.flags.hasIcc || validated.hasProfile,
      hasGps: extraction.gps.present,
      entryCount: entries.filter((e) => e.status === "present").length,
    },
    integrity: { sha256: sha, trailingBytes: trailing, thumbnail: extraction.thumbnail, notes: integrityNotes },
    engine: {
      name: "exifr (metadata) + sharp/libvips (image validation)",
      notes: [
        "ExifTool is not used in this build. MakerNotes and some proprietary tags are not decoded.",
        ...extraction.notes,
      ],
    },
    limitations: [
      "Metadata is self-reported by the file and can be edited, copied or removed. It cannot prove origin, authenticity or manipulation.",
      "Only data inside the uploaded file is analysed. File-system creation and modification times are not available from an upload.",
      "PixelTrace does not identify photographers, recover missing GPS data or guess devices.",
    ],
    persisted,
  };

  const thumbnail = `data:image/jpeg;base64,${validated.thumbnail.toString("base64")}`;
  return { result: { ...result, thumbnail }, thumbnail };
}
