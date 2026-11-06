import { AppError, errorResponse } from "@/lib/errors";
import { toBatchCsv, toBatchJson } from "@/lib/exports";
import { maskResult, parseReveal } from "@/lib/mask";
import { getAnalyses, isUuid, listHistory } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: { params: Promise<{ format: string }> }) {
  try {
    const { format } = await ctx.params;
    if (!["json", "csv"].includes(format)) throw new AppError(404, "unknown_format", "Batch summaries are available as json or csv.");
    const p = new URL(req.url).searchParams;
    let ids = (p.get("ids") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    const sessionId = p.get("sessionId");
    if (sessionId && /^[A-Za-z0-9-]{8,64}$/.test(sessionId)) {
      ids = (await listHistory({ sessionId, limit: 200 })).items.map((i) => i.id);
    }
    if (ids.length === 0) throw new AppError(400, "no_ids", "Provide ?ids=a,b,c or ?sessionId=…");
    if (ids.some((i) => !isUuid(i))) throw new AppError(400, "invalid_id", "One or more analysis ids are not valid.");
    const reveal = parseReveal(p);
    const results = (await getAnalyses(ids)).map((r) => maskResult(r, reveal));
    if (results.length === 0) throw new AppError(404, "not_found", "None of the requested analyses exist.");
    const stamp = new Date().toISOString().slice(0, 10);
    const body = format === "csv" ? toBatchCsv(results) : toBatchJson(results, reveal, p.get("full") === "1");
    return new Response(body, {
      headers: {
        "Content-Type": format === "csv" ? "text/csv; charset=utf-8" : "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="pixeltrace-batch-${stamp}.${format}"`,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
