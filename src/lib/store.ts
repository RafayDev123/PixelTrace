import { and, desc, eq, ilike, lt, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { analyses, appSettings } from "@/db/schema";
import { config } from "./config";
import { AppError } from "./errors";
import type { AnalysisResult, AppSettings, DashboardStats, HistoryItem, MetadataLevel, Severity } from "./types";

const DEFAULTS: AppSettings = { saveHistory: true, storeThumbnail: true, retentionDays: 0, confirmBeforeReveal: true };
const ALLOWED_RETENTION = [0, 1, 7, 30, 90, 365];

export async function getSettings(): Promise<AppSettings> {
  const rows = await db.select().from(appSettings).limit(1);
  if (rows.length === 0) {
    await db.insert(appSettings).values({ id: 1, ...DEFAULTS }).onConflictDoNothing();
    return { ...DEFAULTS };
  }
  const r = rows[0];
  return {
    saveHistory: r.saveHistory,
    storeThumbnail: r.storeThumbnail,
    retentionDays: r.retentionDays,
    confirmBeforeReveal: r.confirmBeforeReveal,
  };
}

export async function updateSettings(patch: unknown): Promise<AppSettings> {
  if (typeof patch !== "object" || patch === null) throw new AppError(400, "invalid_body", "Settings must be a JSON object.");
  const p = patch as Record<string, unknown>;
  const current = await getSettings();
  const next: AppSettings = { ...current };
  for (const key of ["saveHistory", "storeThumbnail", "confirmBeforeReveal"] as const) {
    if (key in p) {
      if (typeof p[key] !== "boolean") throw new AppError(400, "invalid_setting", `${key} must be true or false.`);
      next[key] = p[key] as boolean;
    }
  }
  if ("retentionDays" in p) {
    if (typeof p.retentionDays !== "number" || !ALLOWED_RETENTION.includes(p.retentionDays))
      throw new AppError(400, "invalid_setting", `retentionDays must be one of ${ALLOWED_RETENTION.join(", ")}.`);
    next.retentionDays = p.retentionDays;
  }
  await db
    .insert(appSettings)
    .values({ id: 1, ...next })
    .onConflictDoUpdate({ target: appSettings.id, set: { ...next, updatedAt: new Date() } });
  await purgeExpired();
  return next;
}

let lastPurge = 0;

/** Removes session-only reports older than the TTL and history past the retention period. */
export async function purgeExpired(force = false): Promise<number> {
  const nowMs = Date.now();
  if (!force && nowMs - lastPurge < 60_000) return 0;
  lastPurge = nowMs;
  const settings = await getSettings();
  const sessionCutoff = new Date(nowMs - config.sessionOnlyTtlMinutes * 60_000);
  const conditions: (SQL | undefined)[] = [and(eq(analyses.persisted, false), lt(analyses.createdAt, sessionCutoff))];
  if (settings.retentionDays > 0) {
    conditions.push(and(eq(analyses.persisted, true), lt(analyses.createdAt, new Date(nowMs - settings.retentionDays * 86_400_000))));
  }
  const deleted = await db.delete(analyses).where(or(...conditions)).returning({ id: analyses.id });
  return deleted.length;
}

export async function saveAnalysis(result: AnalysisResult, meta: { thumbnail: string | null; ownerId: string }): Promise<void> {
  const make = result.camera.find((f) => f.id === "make")?.value ?? null;
  const model = result.camera.find((f) => f.id === "model")?.value ?? null;
  const { thumbnail: _omit, ...stored } = result;
  void _omit;
  await db.insert(analyses).values({
    id: result.id,
    ownerId: meta.ownerId,
    sessionId: result.sessionId,
    filename: result.file.filename,
    format: result.file.detectedFormat,
    mime: result.file.mime,
    sizeBytes: result.file.sizeBytes,
    width: result.file.width,
    height: result.file.height,
    sha256: result.file.sha256,
    cameraMake: make,
    cameraModel: model,
    hasGps: result.gps.present,
    hasExif: result.availability.hasExif,
    metadataLevel: result.availability.level,
    indicatorCount: result.indicators.length,
    topSeverity: result.indicators.reduce<Severity>((t, i) => {
      const order = ["informational", "low", "medium", "high"];
      return order.indexOf(i.severity) > order.indexOf(t) ? i.severity : t;
    }, "informational"),
    persisted: result.persisted,
    thumbnail: meta.thumbnail,
    result: stored,
    createdAt: new Date(result.analyzedAt),
  });
}

export async function findDuplicates(sha256: string, sessionId: string, ownerId: string) {
  const rows = await db
    .select({ id: analyses.id, filename: analyses.filename, createdAt: analyses.createdAt })
    .from(analyses)
    .where(and(eq(analyses.ownerId, ownerId), eq(analyses.sha256, sha256), or(eq(analyses.persisted, true), eq(analyses.sessionId, sessionId))))
    .orderBy(desc(analyses.createdAt))
    .limit(5);
  return rows.map((r) => ({ id: r.id, filename: r.filename, analyzedAt: r.createdAt.toISOString() }));
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isUuid(v: string): boolean {
  return UUID_RE.test(v);
}

export async function getAnalysis(id: string, ownerId: string): Promise<AnalysisResult | null> {
  if (!isUuid(id)) return null;
  const rows = await db.select().from(analyses).where(and(eq(analyses.id, id), eq(analyses.ownerId, ownerId))).limit(1);
  if (!rows[0]) return null;
  return { ...(rows[0].result as AnalysisResult), thumbnail: rows[0].thumbnail };
}

export async function getAnalyses(ids: string[], ownerId: string): Promise<AnalysisResult[]> {
  const out: AnalysisResult[] = [];
  for (const id of ids.slice(0, 100)) {
    const r = await getAnalysis(id, ownerId);
    if (r) out.push(r);
  }
  return out;
}

export async function deleteAnalysis(id: string, ownerId: string): Promise<boolean> {
  if (!isUuid(id)) return false;
  const rows = await db.delete(analyses).where(and(eq(analyses.id, id), eq(analyses.ownerId, ownerId))).returning({ id: analyses.id });
  return rows.length > 0;
}

export async function deleteAll(ownerId: string): Promise<number> {
  const rows = await db.delete(analyses).where(eq(analyses.ownerId, ownerId)).returning({ id: analyses.id });
  return rows.length;
}

function toItem(r: typeof analyses.$inferSelect): HistoryItem {
  return {
    id: r.id,
    sessionId: r.sessionId,
    filename: r.filename,
    format: r.format,
    sizeBytes: r.sizeBytes,
    width: r.width,
    height: r.height,
    sha256: r.sha256,
    cameraMake: r.cameraMake,
    cameraModel: r.cameraModel,
    hasGps: r.hasGps,
    hasExif: r.hasExif,
    metadataLevel: r.metadataLevel as MetadataLevel,
    indicatorCount: r.indicatorCount,
    topSeverity: r.topSeverity as Severity,
    persisted: r.persisted,
    createdAt: r.createdAt.toISOString(),
  };
}

export interface HistoryQuery {
  ownerId: string;
  q?: string;
  format?: string;
  gps?: "yes" | "no";
  metadata?: MetadataLevel;
  severity?: Severity;
  limit?: number;
  offset?: number;
  /** include session-only reports (used to resolve a batch of just-analysed files) */
  sessionId?: string;
}

export async function listHistory(query: HistoryQuery): Promise<{ items: HistoryItem[]; total: number }> {
  const where: (SQL | undefined)[] = [eq(analyses.ownerId, query.ownerId)];
  if (query.sessionId) where.push(eq(analyses.sessionId, query.sessionId));
  else where.push(eq(analyses.persisted, true));
  if (query.q) {
    const term = `%${query.q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
    where.push(or(ilike(analyses.filename, term), ilike(analyses.cameraMake, term), ilike(analyses.cameraModel, term), ilike(analyses.sha256, term)));
  }
  if (query.format) where.push(eq(analyses.format, query.format));
  if (query.gps) where.push(eq(analyses.hasGps, query.gps === "yes"));
  if (query.metadata) where.push(eq(analyses.metadataLevel, query.metadata));
  if (query.severity) where.push(eq(analyses.topSeverity, query.severity));
  const cond = and(...where);
  const limit = Math.min(Math.max(query.limit ?? 50, 1), 200);
  const rows = await db.select().from(analyses).where(cond).orderBy(desc(analyses.createdAt)).limit(limit).offset(Math.max(query.offset ?? 0, 0));
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(analyses).where(cond);
  return { items: rows.map(toItem), total: n };
}

export async function dashboardStats(ownerId: string): Promise<DashboardStats> {
  const persisted = eq(analyses.persisted, true);
  const owned = and(persisted, eq(analyses.ownerId, ownerId));
  const [totals] = await db
    .select({
      total: sql<number>`count(*)::int`,
      today: sql<number>`count(*) filter (where ${analyses.createdAt} >= date_trunc('day', now()))::int`,
      sessions: sql<number>`count(distinct ${analyses.sessionId})::int`,
      withGps: sql<number>`count(*) filter (where ${analyses.hasGps})::int`,
      missing: sql<number>`count(*) filter (where not ${analyses.hasExif})::int`,
    })
    .from(analyses)
    .where(owned);
  const formats = await db
    .select({ label: analyses.format, count: sql<number>`count(*)::int` })
    .from(analyses)
    .where(owned)
    .groupBy(analyses.format)
    .orderBy(desc(sql`count(*)`));
  const makers = await db
    .select({ label: analyses.cameraMake, count: sql<number>`count(*)::int` })
    .from(analyses)
    .where(and(owned, sql`${analyses.cameraMake} is not null`))
    .groupBy(analyses.cameraMake)
    .orderBy(desc(sql`count(*)`))
    .limit(8);
  const recent = await db.select().from(analyses).where(owned).orderBy(desc(analyses.createdAt)).limit(6);
  return {
    total: totals.total,
    today: totals.today,
    sessions: totals.sessions,
    withGps: totals.withGps,
    missingMetadata: totals.missing,
    formats: formats.map((f) => ({ label: f.label, count: f.count })),
    makers: makers.map((m) => ({ label: m.label ?? "Unknown", count: m.count })),
    recent: recent.map(toItem),
  };
}
