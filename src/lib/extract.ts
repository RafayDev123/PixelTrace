import exifr from "exifr";
import sharp from "sharp";
import { formatExifDate } from "./dates";
import type {
  EntryStatus,
  Field,
  GpsInfo,
  MetaEntry,
  MetaValue,
  SectionId,
  SensitiveKind,
} from "./types";
import type { DetectedFormat } from "./validate";

const BLOCKS: Record<string, { group: string; section?: SectionId }> = {
  ifd0: { group: "IFD0" },
  exif: { group: "EXIF" },
  gps: { group: "GPS", section: "gps" },
  interop: { group: "Interop", section: "technical" },
  ifd1: { group: "IFD1 (embedded thumbnail)", section: "technical" },
  iptc: { group: "IPTC", section: "iptc" },
  xmp: { group: "XMP", section: "xmp" },
  icc: { group: "ICC Profile", section: "technical" },
  jfif: { group: "JFIF", section: "technical" },
  ihdr: { group: "PNG IHDR", section: "technical" },
};

const CAMERA_KEYS = new Set([
  "Make", "Model", "LensMake", "LensModel", "LensInfo", "LensSpecification", "SerialNumber",
  "BodySerialNumber", "CameraSerialNumber", "LensSerialNumber", "Software", "FirmwareVersion",
  "HostComputer", "OwnerName", "CameraOwnerName",
]);
const CAPTURE_KEYS = new Set([
  "DateTimeOriginal", "CreateDate", "ModifyDate", "OffsetTime", "OffsetTimeOriginal",
  "OffsetTimeDigitized", "SubSecTime", "SubSecTimeOriginal", "SubSecTimeDigitized", "ExposureTime",
  "FNumber", "ISO", "FocalLength", "FocalLengthIn35mmFormat", "Flash", "WhiteBalance",
  "ExposureProgram", "MeteringMode", "DigitalZoomRatio", "ExposureBiasValue", "ExposureMode",
  "SceneCaptureType", "LightSource", "ShutterSpeedValue", "ApertureValue", "BrightnessValue",
  "MaxApertureValue", "SubjectDistance", "ISOSpeedRatings", "SensitivityType",
]);
const TECH_KEYS = new Set([
  "Orientation", "XResolution", "YResolution", "ResolutionUnit", "YCbCrPositioning", "ColorSpace",
  "ExifImageWidth", "ExifImageHeight", "PixelXDimension", "PixelYDimension", "ExifVersion",
  "FlashpixVersion", "ComponentsConfiguration", "ImageWidth", "ImageHeight", "BitsPerSample",
  "Compression", "PhotometricInterpretation", "SamplesPerPixel", "RowsPerStrip", "PlanarConfiguration",
  "SampleFormat", "ExtraSamples", "CustomRendered", "SceneType", "FileSource", "SensingMethod",
  "Predictor", "TileWidth", "TileLength", "ThumbnailOffset", "ThumbnailLength", "InteropIndex",
  "InteropVersion", "ReferenceBlackWhite", "YCbCrCoefficients", "YCbCrSubSampling", "WhitePoint", "TransferFunction", "PrimaryChromaticities", "NewSubfileType", "SubfileType", "FillOrder", "Gamma", "FocalPlaneXResolution", "FocalPlaneYResolution", "FocalPlaneResolutionUnit",
]);
const SKIP_KEYS = new Set([
  "ExifIFD", "GpsIFD", "InteropIFD", "ExifOffset", "GPSInfo", "StripOffsets", "StripByteCounts",
  "JPEGTables", "latitude", "longitude", "MakerNote", "PrintIM", "TileOffsets", "TileByteCounts",
]);

const IDENTIFIER_RE = /serial|uniqueid|owner|e-?mail|phone|^tel|fax|postal|ciadr|ciemail|citel|ciurl|contactinfo|^address/i;
const LOCATION_TEXT_RE = /sublocation|(^|[^a-z])city|province|^state$|country|^location|worldregion|latitude|longitude|gps/i;

export function classifySensitive(group: string, key: string): { sensitive: boolean; kind?: SensitiveKind } {
  if (group === "GPS") return { sensitive: true, kind: "location" };
  if (IDENTIFIER_RE.test(key)) return { sensitive: true, kind: "identifier" };
  if ((group === "IPTC" || group === "XMP") && LOCATION_TEXT_RE.test(key)) return { sensitive: true, kind: "location" };
  return { sensitive: false };
}

const MAX_STRING = 2000;

function cleanString(s: string): string {
  return s.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim().slice(0, MAX_STRING);
}

function isTypedArray(v: unknown): v is ArrayLike<number> & { byteLength: number } {
  return ArrayBuffer.isView(v) && !(v instanceof DataView);
}

export function normalizeValue(v: unknown): { value: MetaValue; status: EntryStatus } {
  if (v === null || v === undefined) return { value: null, status: "empty" };
  if (typeof v === "string") {
    const s = cleanString(v);
    return s ? { value: s, status: "present" } : { value: "", status: "empty" };
  }
  if (typeof v === "number") return Number.isFinite(v) ? { value: v, status: "present" } : { value: null, status: "unreadable" };
  if (typeof v === "boolean") return { value: v, status: "present" };
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? { value: null, status: "unreadable" } : { value: v.toISOString(), status: "present" };
  if (isTypedArray(v)) {
    const arr = Array.from(v as ArrayLike<number>);
    if (arr.length === 0) return { value: null, status: "empty" };
    if (arr.length <= 8) {
      if (arr.every((b) => b >= 0x30 && b <= 0x7e)) return { value: String.fromCharCode(...arr), status: "present" };
      return { value: arr.map(String), status: "present" };
    }
    return { value: `[binary data, ${v.byteLength} bytes]`, status: "present" };
  }
  if (Array.isArray(v)) {
    if (v.length === 0) return { value: null, status: "empty" };
    if (v.length > 64 && v.every((x) => typeof x === "number")) return { value: `[${v.length} numeric values]`, status: "present" };
    if (v.every((x) => ["string", "number", "boolean"].includes(typeof x))) {
      return { value: v.slice(0, 100).map((x) => cleanString(String(x))), status: "present" };
    }
    try {
      return { value: cleanString(JSON.stringify(v)), status: "present" };
    } catch {
      return { value: null, status: "unreadable" };
    }
  }
  try {
    return { value: cleanString(JSON.stringify(v)), status: "present" };
  } catch {
    return { value: null, status: "unreadable" };
  }
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v) && !isTypedArray(v) && !(v instanceof Date);
}

function flatten(obj: Record<string, unknown>, prefix: string, out: [string, unknown][], depth: number) {
  for (const [k, v] of Object.entries(obj)) {
    if (isPlainObject(v) && depth < 3) flatten(v, `${prefix}${k}.`, out, depth + 1);
    else out.push([`${prefix}${k}`, v]);
  }
}

// ---------------------------------------------------------------- WebP / XMP helpers

function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d{1,6});/g, (_, n) => String.fromCodePoint(Math.min(Number(n), 0x10ffff)))
    .replace(/&amp;/g, "&");
}

/**
 * Minimal, non-executing XMP reader used where exifr cannot read XMP (WebP).
 * Pure string matching: no XML entity expansion and no external resources.
 */
export function parseXmpLite(xml: string): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const text = xml.slice(0, 1_000_000);
  const skipPrefix = new Set(["xmlns", "rdf", "x", "xml"]);
  for (const m of text.matchAll(/\b([A-Za-z][\w-]*):([A-Za-z][\w-]*)\s*=\s*"([^"]*)"/g)) {
    if (skipPrefix.has(m[1])) continue;
    out[m[2]] = decodeEntities(m[3]);
  }
  for (const m of text.matchAll(/<([A-Za-z][\w-]*):([A-Za-z][\w-]*)>\s*<rdf:(?:Seq|Bag|Alt)>([\s\S]*?)<\/rdf:(?:Seq|Bag|Alt)>/g)) {
    const items = [...m[3].matchAll(/<rdf:li[^>]*>([^<]*)<\/rdf:li>/g)].map((i) => decodeEntities(i[1]).trim()).filter(Boolean);
    if (items.length) out[m[2]] = items;
  }
  for (const m of text.matchAll(/<([A-Za-z][\w-]*):([A-Za-z][\w-]*)>([^<]+)<\/\1:\2>/g)) {
    if (skipPrefix.has(m[1])) continue;
    const v = decodeEntities(m[3]).trim();
    if (v && !(m[2] in out)) out[m[2]] = v;
  }
  return out;
}

function readWebpChunks(buf: Buffer): { exif?: Buffer; xmp?: Buffer; icc: boolean } {
  const res: { exif?: Buffer; xmp?: Buffer; icc: boolean } = { icc: false };
  let off = 12;
  while (off + 8 <= buf.length) {
    const id = buf.toString("latin1", off, off + 4);
    const size = buf.readUInt32LE(off + 4);
    const start = off + 8;
    const end = Math.min(start + size, buf.length);
    if (id === "EXIF") {
      let data = buf.subarray(start, end);
      if (data.length > 6 && data.toString("latin1", 0, 4) === "Exif") data = data.subarray(6);
      res.exif = data;
    } else if (id === "XMP ") res.xmp = buf.subarray(start, end);
    else if (id === "ICCP") res.icc = true;
    off = start + size + (size % 2);
  }
  return res;
}

// ---------------------------------------------------------------- main extraction

export interface ExtractionOutput {
  entries: MetaEntry[];
  camera: Field[];
  capture: Field[];
  authoring: Field[];
  gps: GpsInfo;
  flags: { hasExif: boolean; hasIptc: boolean; hasXmp: boolean; hasIcc: boolean };
  thumbnail: { width: number; height: number } | null;
  iccDescription: string | null;
  notes: string[];
  parserFailed: boolean;
}

const PARSE_OPTIONS = {
  tiff: true, ifd0: true, exif: true, gps: true, interop: true, ifd1: true, xmp: true, iptc: true,
  icc: true, jfif: true, ihdr: true, makerNote: false, userComment: true, multiSegment: true,
  mergeOutput: false, translateKeys: true, translateValues: true, reviveValues: false,
  sanitize: false, silentErrors: true,
} as unknown as Parameters<typeof exifr.parse>[1];

type Blocks = Record<string, Record<string, unknown> | undefined>;

async function readBlocks(buffer: Buffer, format: DetectedFormat, notes: string[]): Promise<{ blocks: Blocks; failed: boolean; icc: boolean }> {
  try {
    if (format === "webp") {
      const { exif, xmp, icc } = readWebpChunks(buffer);
      const blocks: Blocks = {};
      if (exif && exif.length > 8) {
        const parsed = (await exifr.parse(exif, PARSE_OPTIONS)) as Blocks | undefined;
        if (parsed) Object.assign(blocks, parsed);
      }
      if (xmp) {
        const x = parseXmpLite(xmp.toString("utf8"));
        if (Object.keys(x).length) blocks.xmp = x;
      }
      if (icc) notes.push("An embedded ICC profile chunk exists in this WebP but its contents are not decoded.");
      notes.push("WebP metadata is read from its EXIF and XMP chunks; XMP is parsed with a simplified reader.");
      return { blocks, failed: false, icc };
    }
    const parsed = (await exifr.parse(buffer, PARSE_OPTIONS)) as Blocks | undefined;
    return { blocks: parsed ?? {}, failed: false, icc: false };
  } catch {
    return { blocks: {}, failed: true, icc: false };
  }
}

function toNum(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  return null;
}

export function dmsToDecimal(dms: unknown, ref: unknown): number | null {
  let value: number | null = null;
  if (Array.isArray(dms) && dms.length >= 1) {
    const [d, m = 0, s = 0] = dms.map((x) => toNum(x));
    if (d === null || m === null || s === null) return null;
    value = Math.abs(d) + m / 60 + s / 3600;
    if (d < 0) value = -value;
  } else value = toNum(dms);
  if (value === null) return null;
  const r = typeof ref === "string" ? ref.trim().toUpperCase() : "";
  if (r === "S" || r === "W") value = -Math.abs(value);
  return Math.round(value * 1e7) / 1e7;
}

function buildGps(block: Record<string, unknown> | undefined): GpsInfo {
  const empty: GpsInfo = { present: false, masked: false, latitude: null, longitude: null, altitude: null, timestamp: null, direction: null, speed: null };
  if (!block) return empty;
  const lat = dmsToDecimal(block.GPSLatitude, block.GPSLatitudeRef);
  const lon = dmsToDecimal(block.GPSLongitude, block.GPSLongitudeRef);
  const valid = lat !== null && lon !== null && Math.abs(lat) <= 90 && Math.abs(lon) <= 180 && !(lat === 0 && lon === 0);
  const gps: GpsInfo = { ...empty, present: valid, latitude: valid ? lat : null, longitude: valid ? lon : null };
  const alt = toNum(block.GPSAltitude);
  if (alt !== null) {
    const refRaw = isTypedArray(block.GPSAltitudeRef) ? (block.GPSAltitudeRef as ArrayLike<number>)[0] : block.GPSAltitudeRef;
    const below = refRaw === 1 || refRaw === "1" || (typeof refRaw === "string" && /below/i.test(refRaw));
    gps.altitude = `${below ? "-" : ""}${Math.round(alt * 10) / 10} m ${below ? "(below sea level)" : "(above sea level)"}`;
  }
  const date = typeof block.GPSDateStamp === "string" ? block.GPSDateStamp.replace(/:/g, "-") : null;
  const t = block.GPSTimeStamp;
  if (Array.isArray(t) && t.length >= 3 && t.every((x) => toNum(x) !== null)) {
    const [h, m, s] = t.map((x) => Number(x));
    const hms = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(Math.floor(s)).padStart(2, "0")}`;
    gps.timestamp = `${date ?? "date not recorded"} ${hms} UTC`;
  } else if (date) gps.timestamp = `${date} (time not recorded)`;
  const dir = toNum(block.GPSImgDirection);
  if (dir !== null) {
    const ref = String(block.GPSImgDirectionRef ?? "").toUpperCase();
    gps.direction = `${Math.round(dir * 10) / 10}°${ref === "T" ? " (true north)" : ref === "M" ? " (magnetic north)" : ""}`;
  }
  const speed = toNum(block.GPSSpeed);
  if (speed !== null) {
    const ref = String(block.GPSSpeedRef ?? "K").toUpperCase();
    const unit = ref === "M" ? "mph" : ref === "N" ? "knots" : "km/h";
    gps.speed = `${Math.round(speed * 10) / 10} ${unit}`;
  }
  return gps;
}

const GROUP_PRIORITY = ["EXIF", "IFD0", "XMP", "IPTC", "GPS"];

function lookup(entries: MetaEntry[], keys: string[]): MetaEntry | undefined {
  for (const key of keys) {
    const lk = key.toLowerCase();
    const matches = entries.filter((e) => e.key.toLowerCase() === lk && e.status === "present");
    if (matches.length) {
      matches.sort((a, b) => {
        const pa = GROUP_PRIORITY.indexOf(a.group);
        const pb = GROUP_PRIORITY.indexOf(b.group);
        return (pa === -1 ? 99 : pa) - (pb === -1 ? 99 : pb);
      });
      return matches[0];
    }
  }
  return undefined;
}

export function entryValue(entries: MetaEntry[], ...keys: string[]): MetaValue | undefined {
  return lookup(entries, keys)?.value;
}

function display(v: MetaValue | undefined): string | null {
  if (v === undefined || v === null) return null;
  if (Array.isArray(v)) return v.join(", ");
  return String(v);
}

function fmtExposure(v: MetaValue | undefined): string | null {
  if (typeof v === "number") {
    if (v <= 0) return String(v);
    return v < 1 ? `1/${Math.round(1 / v)} s` : `${Math.round(v * 100) / 100} s`;
  }
  return display(v);
}

function field(id: string, label: string, value: string | null, extra: Partial<Field> = {}): Field {
  return { id, label, value, present: value !== null && value !== "", sensitive: false, ...extra };
}

function buildCamera(entries: MetaEntry[]): Field[] {
  const f = (id: string, label: string, keys: string[], sensitive?: boolean): Field => {
    const e = lookup(entries, keys);
    return field(id, label, display(e?.value), sensitive ? { sensitive: true, sensitiveKind: "identifier" } : {});
  };
  return [
    f("make", "Camera manufacturer", ["Make"]),
    f("model", "Camera model", ["Model"]),
    f("lensMake", "Lens manufacturer", ["LensMake"]),
    f("lensModel", "Lens model", ["LensModel"]),
    f("software", "Software", ["Software", "CreatorTool"]),
    f("firmware", "Firmware", ["FirmwareVersion"]),
    f("hostComputer", "Host device", ["HostComputer"]),
    f("serial", "Camera serial number", ["BodySerialNumber", "CameraSerialNumber", "SerialNumber"], true),
    f("lensSerial", "Lens serial number", ["LensSerialNumber"], true),
  ];
}

function buildCapture(entries: MetaEntry[]): Field[] {
  const date = (id: string, label: string, keys: string[], offsetKeys: string[]): Field => {
    const e = lookup(entries, keys);
    const fmt = e ? formatExifDate(e.value, entryValue(entries, ...offsetKeys)) : null;
    return field(id, label, fmt?.value ?? null, fmt?.note ? { note: fmt.note } : {});
  };
  const g = (id: string, label: string, keys: string[], fmt?: (v: MetaValue | undefined) => string | null): Field => {
    const v = entryValue(entries, ...keys);
    return field(id, label, fmt ? fmt(v) : display(v));
  };
  return [
    date("dateTimeOriginal", "Original capture time (DateTimeOriginal)", ["DateTimeOriginal"], ["OffsetTimeOriginal", "OffsetTime"]),
    date("createDate", "Digitised time (CreateDate)", ["CreateDate", "DateTimeDigitized"], ["OffsetTimeDigitized", "OffsetTime"]),
    date("modifyDate", "Metadata modified (ModifyDate)", ["ModifyDate", "DateTime"], ["OffsetTime"]),
    g("offsetOriginal", "Time zone offset (OffsetTimeOriginal)", ["OffsetTimeOriginal", "OffsetTime"]),
    g("subSec", "Subsecond (SubSecTimeOriginal)", ["SubSecTimeOriginal", "SubSecTime"]),
    g("exposureTime", "Exposure time", ["ExposureTime"], fmtExposure),
    g("aperture", "Aperture", ["FNumber"], (v) => (typeof v === "number" ? `f/${Math.round(v * 10) / 10}` : display(v))),
    g("iso", "ISO", ["ISO", "ISOSpeedRatings"]),
    g("focalLength", "Focal length", ["FocalLength"], (v) => (typeof v === "number" ? `${Math.round(v * 10) / 10} mm` : display(v))),
    g("flash", "Flash", ["Flash"]),
    g("whiteBalance", "White balance", ["WhiteBalance"]),
    g("exposureProgram", "Exposure program", ["ExposureProgram"]),
    g("meteringMode", "Metering mode", ["MeteringMode"]),
    g("digitalZoom", "Digital zoom ratio", ["DigitalZoomRatio"], (v) =>
      typeof v === "number" ? (v === 0 || v === 1 ? `${v} (digital zoom not used)` : `${Math.round(v * 100) / 100}×`) : display(v)),
  ];
}

function buildAuthoring(entries: MetaEntry[]): Field[] {
  const g = (id: string, label: string, keys: string[]): Field => field(id, label, display(entryValue(entries, ...keys)));
  return [
    g("creator", "Creator", ["Artist", "creator", "By-line", "byline", "Byline"]),
    g("copyright", "Copyright", ["Copyright", "CopyrightNotice", "rights", "Rights"]),
    g("description", "Description", ["ImageDescription", "description", "Caption", "Caption-Abstract", "caption"]),
    g("title", "Title", ["title", "ObjectName", "Headline", "headline"]),
    g("keywords", "Keywords", ["Keywords", "keywords", "subject", "Subject"]),
    g("usage", "Usage terms", ["UsageTerms", "WebStatement", "Marked"]),
    g("history", "Editing history", ["History", "HistoryAction", "HistorySoftwareAgent", "DerivedFrom", "OriginalDocumentID"]),
  ];
}

function sectionFor(blockKey: string, key: string): SectionId {
  const fixed = BLOCKS[blockKey].section;
  if (fixed) return fixed;
  if (CAMERA_KEYS.has(key)) return "camera";
  if (CAPTURE_KEYS.has(key)) return "capture";
  if (TECH_KEYS.has(key)) return "technical";
  return "other";
}

export async function extractMetadata(buffer: Buffer, format: DetectedFormat): Promise<ExtractionOutput> {
  const notes: string[] = [];
  const { blocks, failed, icc: webpIcc } = await readBlocks(buffer, format, notes);
  const entries: MetaEntry[] = [];

  for (const blockKey of Object.keys(BLOCKS)) {
    const block = blocks[blockKey];
    if (!isPlainObject(block)) continue;
    const flat: [string, unknown][] = [];
    flatten(block, "", flat, 0);
    for (const [key, raw] of flat) {
      if (SKIP_KEYS.has(key) && blockKey !== "xmp") continue;
      const { group } = BLOCKS[blockKey];
      const { value, status } = normalizeValue(raw);
      const cls = classifySensitive(group, key);
      entries.push({
        section: sectionFor(blockKey, key),
        group,
        key: key.slice(0, 200),
        value,
        status,
        sensitive: cls.sensitive,
        ...(cls.kind ? { sensitiveKind: cls.kind } : {}),
      });
    }
  }

  if (failed) {
    entries.push({
      section: "other", group: "PixelTrace", key: "MetadataParser", value: "The metadata block could not be read",
      status: "unreadable", sensitive: false,
    });
    notes.push("The metadata parser failed on this file. Metadata may exist but could not be read.");
  }

  // Embedded thumbnail (EXIF IFD1) for consistency checks.
  let thumbnail: { width: number; height: number } | null = null;
  if (format === "jpeg" || format === "tiff") {
    try {
      const thumb = await exifr.thumbnail(buffer);
      if (thumb && thumb.byteLength > 0) {
        const m = await sharp(Buffer.from(thumb), { limitInputPixels: 25_000_000 }).metadata();
        if (m.width && m.height) thumbnail = { width: m.width, height: m.height };
      }
    } catch {
      /* thumbnail unreadable: treated as not available */
    }
  }

  const infoEntries = entries.filter((e) => e.status === "present" && ["camera", "capture", "gps", "iptc", "xmp", "other"].includes(e.section));
  const hasExif = infoEntries.some((e) => ["EXIF", "IFD0", "GPS"].includes(e.group));
  const hasIptc = entries.some((e) => e.group === "IPTC");
  const hasXmp = entries.some((e) => e.group === "XMP");
  const hasIcc = entries.some((e) => e.group === "ICC Profile") || webpIcc;
  const iccDescription = typeof blocks.icc?.ProfileDescription === "string" ? cleanString(blocks.icc.ProfileDescription) : null;

  return {
    entries,
    camera: buildCamera(entries),
    capture: buildCapture(entries),
    authoring: buildAuthoring(entries),
    gps: buildGps(isPlainObject(blocks.gps) ? blocks.gps : undefined),
    flags: { hasExif, hasIptc, hasXmp, hasIcc },
    thumbnail,
    iccDescription,
    notes,
    parserFailed: failed,
  };
}

/** Count how many informative (non-structural) metadata entries were found. */
export function informativeCount(entries: MetaEntry[]): number {
  return entries.filter(
    (e) => e.status === "present" && ["camera", "capture", "gps", "iptc", "xmp", "other"].includes(e.section) && e.group !== "PixelTrace",
  ).length;
}
