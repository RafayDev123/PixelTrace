const EXIF_RE = /^(\d{4})[:\-](\d{2})[:\-](\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?\s*(Z|[+-]\d{2}:?\d{2})?$/;

/** Parse "+02:00" style offsets into minutes. Returns null when not parseable. */
export function parseOffset(raw: unknown): number | null {
  if (typeof raw !== "string") return null;
  const m = /^([+-])(\d{2}):?(\d{2})$/.exec(raw.trim());
  if (!m) return null;
  const mins = Number(m[2]) * 60 + Number(m[3]);
  return m[1] === "-" ? -mins : mins;
}

/**
 * Parse an EXIF/XMP timestamp to epoch milliseconds.
 * When no zone is present the clock reading is treated as UTC, which is only
 * suitable for comparing two zone-less readings with each other.
 * Returns null for invalid dates (including 0000:00:00 placeholders).
 */
export function parseExifDate(raw: unknown, offsetMinutes?: number | null): number | null {
  if (raw instanceof Date) return Number.isNaN(raw.getTime()) ? null : raw.getTime();
  if (typeof raw !== "string") return null;
  const m = EXIF_RE.exec(raw.trim());
  if (!m) return null;
  const [, y, mo, d, h, mi, s, , zone] = m;
  if (Number(mo) < 1 || Number(mo) > 12 || Number(d) < 1 || Number(d) > 31) return null;
  let ms = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s));
  if (Number.isNaN(ms)) return null;
  const zoneMin = zone ? (zone === "Z" ? 0 : parseOffset(zone)) : (offsetMinutes ?? null);
  if (zoneMin !== null) ms -= zoneMin * 60_000;
  return ms;
}

export function formatOffset(minutes: number): string {
  const sign = minutes < 0 ? "-" : "+";
  const abs = Math.abs(minutes);
  return `UTC${sign}${String(Math.floor(abs / 60)).padStart(2, "0")}:${String(abs % 60).padStart(2, "0")}`;
}

/** Human-readable timestamp string, preserving exactly what the file recorded. */
export function formatExifDate(raw: unknown, offsetRaw?: unknown): { value: string; note?: string } | null {
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) return { value: raw.toISOString(), note: "Stored as a UTC instant." };
  if (typeof raw !== "string" || !raw.trim()) return null;
  const m = EXIF_RE.exec(raw.trim());
  if (!m) return { value: raw.trim(), note: "Unrecognised timestamp format; shown exactly as stored." };
  const base = `${m[1]}-${m[2]}-${m[3]} ${m[4]}:${m[5]}:${m[6]}`;
  const zone = m[8];
  if (zone) return { value: `${base} ${zone === "Z" ? "UTC" : zone}` };
  const off = parseOffset(offsetRaw);
  if (off !== null) return { value: `${base} (${formatOffset(off)})`, note: "Time zone offset taken from the matching OffsetTime field." };
  return { value: base, note: "No time zone recorded: this is the device's local clock reading, not a verified UTC time." };
}
