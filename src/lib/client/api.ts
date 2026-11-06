import type { AnalysisResult, AppSettings, DashboardStats, HistoryItem, RevealOptions, SettingsResponse } from "@/lib/types";

export class ApiError extends Error {
  code: string;
  status: number;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function parse<T>(res: Response): Promise<T> {
  if (res.ok) return (await res.json()) as T;
  let code = "request_failed";
  let message = `Request failed (${res.status}).`;
  try {
    const body = (await res.json()) as { error?: { code?: string; message?: string } };
    if (body.error?.message) message = body.error.message;
    if (body.error?.code) code = body.error.code;
  } catch {
    /* non-JSON error body */
  }
  throw new ApiError(res.status, code, message);
}

export function revealQuery(reveal: Partial<RevealOptions>): string {
  const parts: string[] = [];
  if (reveal.location) parts.push("location");
  if (reveal.identifiers) parts.push("identifiers");
  return parts.length ? `reveal=${parts.join(",")}` : "";
}

export interface HistoryFilters {
  q?: string;
  format?: string;
  gps?: string;
  metadata?: string;
  severity?: string;
  sessionId?: string;
  offset?: number;
  limit?: number;
}

export const api = {
  dashboard: () => fetch("/api/dashboard", { cache: "no-store" }).then(parse<DashboardStats>),
  settings: () => fetch("/api/settings", { cache: "no-store" }).then(parse<SettingsResponse>),
  updateSettings: (patch: Partial<AppSettings>) =>
    fetch("/api/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) }).then(parse<SettingsResponse>),
  purge: () => fetch("/api/settings?action=purge", { method: "POST" }).then(parse<{ removed: number }>),
  history: (f: HistoryFilters = {}) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(f)) if (v !== undefined && v !== "" && v !== null) p.set(k, String(v));
    return fetch(`/api/analysis/history?${p}`, { cache: "no-store" }).then(parse<{ items: HistoryItem[]; total: number }>);
  },
  analysis: (id: string, reveal: Partial<RevealOptions> = {}) => {
    const q = revealQuery(reveal);
    return fetch(`/api/analysis/${id}${q ? `?${q}` : ""}`, { cache: "no-store" }).then(parse<AnalysisResult>);
  },
  deleteAnalysis: (id: string) => fetch(`/api/analysis/${id}`, { method: "DELETE" }).then(parse<{ deleted: boolean }>),
  deleteAll: () => fetch("/api/analysis/history?confirm=all", { method: "DELETE" }).then(parse<{ deleted: number }>),
};

export function reportUrl(id: string, format: "json" | "csv" | "pdf", reveal: Partial<RevealOptions> = {}): string {
  const q = revealQuery(reveal);
  return `/api/reports/${id}/${format}${q ? `?${q}` : ""}`;
}

export function batchUrl(ids: string[], format: "json" | "csv", reveal: Partial<RevealOptions> = {}, full = false): string {
  const parts = [`ids=${ids.join(",")}`];
  const q = revealQuery(reveal);
  if (q) parts.push(q);
  if (full) parts.push("full=1");
  return `/api/reports/batch/${format}?${parts.join("&")}`;
}

/** Upload one file with real upload progress (fetch cannot report upload progress). */
export function analyzeFile(
  file: File,
  opts: { sessionId?: string; onProgress?: (pct: number) => void; signal?: AbortSignal } = {},
): Promise<AnalysisResult> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/analyze");
    xhr.responseType = "json";
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) opts.onProgress?.(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      const body = xhr.response as (AnalysisResult & { error?: { code: string; message: string } }) | null;
      if (xhr.status >= 200 && xhr.status < 300 && body && !body.error) resolve(body as AnalysisResult);
      else reject(new ApiError(xhr.status, body?.error?.code ?? "request_failed", body?.error?.message ?? `Upload failed (${xhr.status}).`));
    };
    xhr.onerror = () => reject(new ApiError(0, "network_error", "Network error: the server could not be reached."));
    xhr.onabort = () => reject(new ApiError(0, "aborted", "Upload cancelled."));
    opts.signal?.addEventListener("abort", () => xhr.abort());
    const fd = new FormData();
    fd.append("file", file);
    if (opts.sessionId) fd.append("sessionId", opts.sessionId);
    xhr.send(fd);
  });
}
