import type { AnalysisResult, Field, MetaEntry, RevealOptions } from "./types";

export const NO_REVEAL: RevealOptions = { location: false, identifiers: false };

/** Parse `reveal=location,identifiers` (also accepts gps/serials aliases). */
export function parseReveal(params: URLSearchParams): RevealOptions {
  const tokens = (params.get("reveal") ?? "")
    .split(",")
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
  return {
    location: tokens.includes("location") || tokens.includes("gps"),
    identifiers: tokens.includes("identifiers") || tokens.includes("serials"),
  };
}

function hidden(kind: "location" | "identifier" | undefined, reveal: RevealOptions): boolean {
  if (kind === "location") return !reveal.location;
  if (kind === "identifier") return !reveal.identifiers;
  return false;
}

/**
 * Returns a copy of the result with every sensitive value withheld unless the caller
 * explicitly revealed that category. GPS coordinates and serial numbers never leave
 * the server unless requested.
 */
export function maskResult(result: AnalysisResult, reveal: RevealOptions = NO_REVEAL): AnalysisResult {
  const r = structuredClone(result);

  r.entries = r.entries.map((e): MetaEntry => {
    if (e.sensitive && e.status === "present" && hidden(e.sensitiveKind, reveal)) return { ...e, value: null, masked: true };
    return e;
  });

  const maskFields = (fields: Field[]): Field[] =>
    fields.map((f) => (f.sensitive && f.present && hidden(f.sensitiveKind, reveal) ? { ...f, value: null, masked: true } : f));
  r.camera = maskFields(r.camera);
  r.capture = maskFields(r.capture);
  r.authoring = maskFields(r.authoring);

  if (!reveal.location) {
    r.gps = { ...r.gps, latitude: null, longitude: null, altitude: null, timestamp: null, direction: null, speed: null, masked: r.gps.present };
  }

  r.indicators = r.indicators.map((ind) => ({
    ...ind,
    evidence: ind.evidence.map((ev) => {
      if (!ev.sensitive || ev.value === null) return ev;
      const isLocation = /^GPS|latitude|longitude/i.test(ev.field);
      const kind = isLocation ? "location" : "identifier";
      return hidden(kind, reveal) ? { ...ev, value: null, masked: true } : ev;
    }),
  }));
  return r;
}
