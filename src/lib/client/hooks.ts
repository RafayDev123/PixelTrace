"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AnalysisResult, Limits, SettingsResponse } from "@/lib/types";
import { api } from "./api";
import { formatBytes } from "./format";

export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let live = true;
    setLoading(true);
    setError(null);
    fn()
      .then((d) => live && setData(d))
      .catch((e: unknown) => live && setError(e instanceof Error ? e.message : "Something went wrong."))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);
  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { data, error, loading, reload, setData };
}

export function useSettings() {
  const { data, error, loading, reload, setData } = useAsync<SettingsResponse>(() => api.settings(), []);
  return { settings: data, error, loading, reload, setSettings: setData };
}

export const FALLBACK_LIMITS: Limits = { maxFiles: 10, maxFileBytes: 20 * 1024 * 1024, maxMegapixels: 40, bulkConcurrency: 3, formats: ["JPEG", "PNG", "WebP", "TIFF"] };

/* ---------------------------------------------------------------- file queue */

export type QueueStatus = "ready" | "uploading" | "analyzing" | "done" | "error";

export interface QueueItem {
  id: string;
  file: File;
  previewUrl: string;
  width: number | null;
  height: number | null;
  status: QueueStatus;
  progress: number;
  error?: string;
  result?: AnalysisResult;
}

const ACCEPT_EXT = /\.(jpe?g|png|webp|tiff?|jfif)$/i;
const ACCEPT_MIME = ["image/jpeg", "image/png", "image/webp", "image/tiff"];

/** Best-effort, client-side pre-check. The backend always re-validates the real content. */
export function precheck(file: File, limits: Limits): string | null {
  if (file.size === 0) return "The file is empty.";
  if (file.size > limits.maxFileBytes) return `Larger than the ${formatBytes(limits.maxFileBytes)} limit (${formatBytes(file.size)}).`;
  const okType = ACCEPT_MIME.includes(file.type) || (file.type === "" && ACCEPT_EXT.test(file.name)) || ACCEPT_EXT.test(file.name);
  if (!okType) {
    if (/\.hei[cf]$/i.test(file.name) || /hei[cf]/.test(file.type)) return "HEIC/HEIF is not supported by this build.";
    return "Unsupported file type. Use JPEG, PNG, WebP or TIFF.";
  }
  return null;
}

function readDimensions(url: string): Promise<{ w: number; h: number } | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

export function useFileQueue(limits: Limits, maxItems: number) {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [notices, setNotices] = useState<string[]>([]);
  const urls = useRef<Set<string>>(new Set());

  useEffect(() => {
    const set = urls.current;
    return () => {
      set.forEach((u) => URL.revokeObjectURL(u));
      set.clear();
    };
  }, []);

  const add = useCallback(
    async (files: File[]) => {
      const msgs: string[] = [];
      const fresh: QueueItem[] = [];
      const room = maxItems - items.length;
      const existing = new Set(items.map((i) => `${i.file.name}|${i.file.size}|${i.file.lastModified}`));
      for (const file of files) {
        const key = `${file.name}|${file.size}|${file.lastModified}`;
        if (existing.has(key)) {
          msgs.push(`${file.name}: already added.`);
          continue;
        }
        if (fresh.length >= room) {
          msgs.push(`${file.name}: not added, the limit is ${maxItems} image${maxItems > 1 ? "s" : ""}.`);
          continue;
        }
        const problem = precheck(file, limits);
        const previewUrl = URL.createObjectURL(file);
        urls.current.add(previewUrl);
        existing.add(key);
        fresh.push({ id: crypto.randomUUID(), file, previewUrl, width: null, height: null, status: problem ? "error" : "ready", progress: 0, error: problem ?? undefined });
      }
      setNotices(msgs);
      if (!fresh.length) return;
      setItems((prev) => [...prev, ...fresh]);
      for (const f of fresh) {
        const dim = await readDimensions(f.previewUrl);
        setItems((prev) => prev.map((i) => (i.id === f.id ? { ...i, width: dim?.w ?? null, height: dim?.h ?? null } : i)));
      }
    },
    [items, limits, maxItems],
  );

  const patch = useCallback((id: string, p: Partial<QueueItem>) => setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...p } : i))), []);

  const remove = useCallback((id: string) => {
    setItems((prev) => {
      const t = prev.find((i) => i.id === id);
      if (t) {
        URL.revokeObjectURL(t.previewUrl);
        urls.current.delete(t.previewUrl);
      }
      return prev.filter((i) => i.id !== id);
    });
    setNotices([]);
  }, []);

  const clear = useCallback(() => {
    setItems((prev) => {
      prev.forEach((i) => {
        URL.revokeObjectURL(i.previewUrl);
        urls.current.delete(i.previewUrl);
      });
      return [];
    });
    setNotices([]);
  }, []);

  return { items, notices, add, patch, remove, clear };
}
