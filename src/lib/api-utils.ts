import { config } from "./config";
import { AppError } from "./errors";

const buckets = new Map<string, { count: number; reset: number }>();

/** Simple fixed-window in-memory limiter. Use a shared store (Redis) behind multiple instances. */
export function rateLimit(req: Request, cost = 1): void {
  const ip = (req.headers.get("x-forwarded-for") ?? "local").split(",")[0].trim().slice(0, 64);
  const now = Date.now();
  const b = buckets.get(ip);
  if (!b || b.reset < now) {
    buckets.set(ip, { count: cost, reset: now + 60_000 });
    if (buckets.size > 5000) for (const [k, v] of buckets) if (v.reset < now) buckets.delete(k);
    return;
  }
  b.count += cost;
  if (b.count > config.rateLimitPerMinute) throw new AppError(429, "rate_limited", "Too many requests. Please wait a minute and try again.");
}

/** Reject oversized request bodies before they are buffered. */
export function checkContentLength(req: Request, maxFiles: number): void {
  const len = Number(req.headers.get("content-length") ?? 0);
  const max = config.maxFileBytes * maxFiles + 1024 * 1024;
  if (len > max) throw new AppError(413, "request_too_large", "The request body is larger than the allowed upload size.");
}

export async function readFormFiles(req: Request, maxFiles: number): Promise<{ files: File[]; form: FormData }> {
  checkContentLength(req, maxFiles);
  const type = req.headers.get("content-type") ?? "";
  if (!type.toLowerCase().startsWith("multipart/form-data"))
    throw new AppError(415, "invalid_content_type", "Send the image as multipart/form-data with a 'file' field.");
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    throw new AppError(400, "invalid_body", "The upload could not be parsed.");
  }
  const files = [...form.getAll("file"), ...form.getAll("files")].filter((f): f is File => typeof f !== "string");
  return { files, form };
}

/** Run async tasks with a fixed concurrency limit, preserving order. */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}
