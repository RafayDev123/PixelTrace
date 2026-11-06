import sharp, { type Metadata } from "sharp";
import { config } from "./config";
import { AppError } from "./errors";

export type DetectedFormat = "jpeg" | "png" | "webp" | "tiff";

export const FORMAT_INFO: Record<
  DetectedFormat,
  { label: string; mime: string; extensions: string[] }
> = {
  jpeg: { label: "JPEG", mime: "image/jpeg", extensions: ["jpg", "jpeg", "jpe", "jfif"] },
  png: { label: "PNG", mime: "image/png", extensions: ["png"] },
  webp: { label: "WebP", mime: "image/webp", extensions: ["webp"] },
  tiff: { label: "TIFF", mime: "image/tiff", extensions: ["tif", "tiff"] },
};

function ascii(buf: Buffer, start: number, end: number): string {
  return buf.subarray(start, end).toString("latin1");
}

/** Detect the real format from magic bytes. Returns a string for rejected-but-recognised types. */
export function sniff(buf: Buffer): DetectedFormat | { rejected: string; code: string } | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpeg";
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
  if (ascii(buf, 0, 4) === "RIFF" && ascii(buf, 8, 12) === "WEBP") return "webp";
  if (
    (buf[0] === 0x49 && buf[1] === 0x49 && buf[2] === 0x2a && buf[3] === 0x00) ||
    (buf[0] === 0x4d && buf[1] === 0x4d && buf[2] === 0x00 && buf[3] === 0x2a)
  )
    return "tiff";

  if (ascii(buf, 4, 8) === "ftyp") {
    const brand = ascii(buf, 8, 12);
    if (["heic", "heix", "hevc", "hevx", "mif1", "msf1", "heim", "heis"].includes(brand))
      return {
        rejected: "HEIC/HEIF images are not supported because no HEIC decoder is available in this build.",
        code: "heic_unsupported",
      };
    if (brand === "avif" || brand === "avis")
      return { rejected: "AVIF images are not supported in this version.", code: "unsupported_format" };
  }
  if (ascii(buf, 0, 4) === "GIF8") return { rejected: "GIF images are not supported in this version.", code: "unsupported_format" };
  if (ascii(buf, 0, 2) === "BM") return { rejected: "BMP images are not supported in this version.", code: "unsupported_format" };

  const head = ascii(buf, 0, 1024).replace(/^\uFEFF/, "").trimStart().toLowerCase();
  if (head.startsWith("<?xml") || head.includes("<svg") || head.startsWith("<!doctype") || head.startsWith("<html") || head.startsWith("<script"))
    return { rejected: "SVG, XML and HTML files can contain active content and are rejected.", code: "active_content_rejected" };
  if (buf[0] === 0x50 && buf[1] === 0x4b && (buf[2] === 0x03 || buf[2] === 0x05))
    return { rejected: "ZIP archives are not accepted. Upload an image file directly.", code: "archive_rejected" };
  if (ascii(buf, 0, 5) === "%PDF-") return { rejected: "PDF documents are not accepted. Upload an image file.", code: "unsupported_format" };
  if (buf[0] === 0x4d && buf[1] === 0x5a) return { rejected: "Executable files are rejected.", code: "active_content_rejected" };
  if (ascii(buf, 0, 2) === "#!") return { rejected: "Script files are rejected.", code: "active_content_rejected" };
  return null;
}

export interface ValidatedImage {
  format: DetectedFormat;
  mime: string;
  width: number;
  height: number;
  space: string;
  channels: number;
  depth: string;
  density: number | null;
  hasAlpha: boolean;
  hasProfile: boolean;
  orientation: number;
  thumbnail: Buffer;
}

export function sanitizeFilename(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "image";
  const cleaned = base.replace(/[\u0000-\u001f\u007f<>:"|?*]/g, "").trim().slice(0, 180);
  return cleaned || "image";
}

export function extensionOf(name: string): string {
  const m = /\.([A-Za-z0-9]{1,8})$/.exec(name);
  return m ? m[1].toLowerCase() : "";
}

/**
 * Validates real image content: size, format, pixel limits and decodability.
 * Generates the small preview thumbnail as part of decoding (this also proves decodability).
 */
export async function validateImage(buf: Buffer): Promise<ValidatedImage> {
  if (buf.length === 0) throw new AppError(400, "empty_file", "The file is empty.");
  if (buf.length > config.maxFileBytes)
    throw new AppError(
      413,
      "file_too_large",
      `File exceeds the ${Math.round(config.maxFileBytes / 1024 / 1024)} MB limit.`,
    );

  const sniffed = sniff(buf);
  if (sniffed === null)
    throw new AppError(415, "unsupported_format", "File content is not a supported image (JPEG, PNG, WebP or TIFF).");
  if (typeof sniffed !== "string") throw new AppError(415, sniffed.code, sniffed.rejected);

  const limitInputPixels = config.maxMegapixels * 1_000_000;
  let meta: Metadata;
  try {
    meta = await sharp(buf, { limitInputPixels, failOn: "truncated" }).metadata();
  } catch {
    throw new AppError(422, "corrupted_image", "The image is corrupted or cannot be decoded.");
  }
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  if (!width || !height) throw new AppError(422, "corrupted_image", "The image has no readable dimensions.");
  if (width * height > limitInputPixels)
    throw new AppError(
      413,
      "image_too_large",
      `Image is ${((width * height) / 1e6).toFixed(1)} MP and exceeds the ${config.maxMegapixels} MP limit.`,
    );

  let thumbnail: Buffer;
  try {
    thumbnail = await sharp(buf, { limitInputPixels, failOn: "truncated" })
      .rotate()
      .resize({ width: config.thumbnailEdge, height: config.thumbnailEdge, fit: "inside", withoutEnlargement: true })
      .flatten({ background: "#ffffff" })
      .jpeg({ quality: 72 })
      .toBuffer();
  } catch {
    throw new AppError(422, "corrupted_image", "The image data is corrupted or truncated.");
  }

  return {
    format: sniffed,
    mime: FORMAT_INFO[sniffed].mime,
    width,
    height,
    space: meta.space ?? "unknown",
    channels: meta.channels ?? 0,
    depth: meta.depth ?? "unknown",
    density: meta.density ?? null,
    hasAlpha: Boolean(meta.hasAlpha),
    hasProfile: Boolean(meta.hasProfile),
    orientation: meta.orientation ?? 1,
    thumbnail,
  };
}
