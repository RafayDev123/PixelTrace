import type { Limits } from "./types";

function positiveInt(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

/** Environment-driven configuration. Nothing here is a secret. */
export const config = {
  maxFiles: positiveInt(process.env.PIXELTRACE_MAX_FILES, 10),
  maxFileBytes: positiveInt(process.env.PIXELTRACE_MAX_FILE_MB, 20) * 1024 * 1024,
  maxMegapixels: positiveInt(process.env.PIXELTRACE_MAX_MEGAPIXELS, 40),
  bulkConcurrency: positiveInt(process.env.PIXELTRACE_BULK_CONCURRENCY, 3),
  rateLimitPerMinute: positiveInt(process.env.PIXELTRACE_RATE_LIMIT_PER_MIN, 120),
  thumbnailEdge: 480,
  sessionOnlyTtlMinutes: 60,
  cloud: {
    enabled: process.env.PIXELTRACE_CLOUD_ENABLED === "true",
  },
};

export const SUPPORTED_FORMATS = ["JPEG", "PNG", "WebP", "TIFF"];

export function getLimits(): Limits {
  return {
    maxFiles: config.maxFiles,
    maxFileBytes: config.maxFileBytes,
    maxMegapixels: config.maxMegapixels,
    bulkConcurrency: config.bulkConcurrency,
    formats: SUPPORTED_FORMATS,
  };
}
