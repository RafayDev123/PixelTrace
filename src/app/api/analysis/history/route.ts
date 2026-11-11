import { errorResponse, AppError } from "@/lib/errors";
import { ownerFromRequest } from "@/lib/owner";
import { deleteAll, listHistory, purgeExpired } from "@/lib/store";
import type { MetadataLevel, Severity } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LEVELS = ["none", "limited", "rich"];
const SEVERITIES = ["informational", "low", "medium", "high"];

export async function GET(req: Request) {
  try {
    await purgeExpired().catch(() => 0);
    const p = new URL(req.url).searchParams;
    const gps = p.get("gps");
    const metadata = p.get("metadata");
    const severity = p.get("severity");
    const sessionId = p.get("sessionId");
    const data = await listHistory({
      ownerId: ownerFromRequest(req),
      q: p.get("q")?.slice(0, 100) || undefined,
      format: p.get("format") || undefined,
      gps: gps === "yes" || gps === "no" ? gps : undefined,
      metadata: metadata && LEVELS.includes(metadata) ? (metadata as MetadataLevel) : undefined,
      severity: severity && SEVERITIES.includes(severity) ? (severity as Severity) : undefined,
      limit: Number(p.get("limit")) || 50,
      offset: Number(p.get("offset")) || 0,
      sessionId: sessionId && /^[A-Za-z0-9-]{8,64}$/.test(sessionId) ? sessionId : undefined,
    });
    return Response.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(req: Request) {
  try {
    if (new URL(req.url).searchParams.get("confirm") !== "all")
      throw new AppError(400, "confirmation_required", "Add ?confirm=all to delete all stored analyses.");
    const deleted = await deleteAll(ownerFromRequest(req));
    return Response.json({ deleted });
  } catch (err) {
    return errorResponse(err);
  }
}
