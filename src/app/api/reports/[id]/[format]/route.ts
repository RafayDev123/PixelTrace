import { AppError, errorResponse } from "@/lib/errors";
import { safeDownloadName, toMetadataCsv, toReportJson } from "@/lib/exports";
import { maskResult, parseReveal } from "@/lib/mask";
import { buildPdf } from "@/lib/pdf";
import { getAnalysis, isUuid } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: { params: Promise<{ id: string; format: string }> }) {
  try {
    const { id, format } = await ctx.params;
    if (!isUuid(id)) throw new AppError(400, "invalid_id", "Analysis id is not valid.");
    if (!["json", "csv", "pdf"].includes(format)) throw new AppError(404, "unknown_format", "Report format must be json, csv or pdf.");
    const stored = await getAnalysis(id);
    if (!stored) throw new AppError(404, "not_found", "Analysis not found. It may have been deleted or expired.");
    const reveal = parseReveal(new URL(req.url).searchParams);
    const r = maskResult(stored, reveal);
    const headers = (type: string, ext: string) => ({
      "Content-Type": type,
      "Content-Disposition": `attachment; filename="${safeDownloadName(r.file.filename, ext)}"`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    });
    if (format === "json") return new Response(toReportJson(r, reveal), { headers: headers("application/json; charset=utf-8", "json") });
    if (format === "csv") return new Response(toMetadataCsv(r), { headers: headers("text/csv; charset=utf-8", "csv") });
    const pdf = await buildPdf(r, reveal);
    return new Response(Buffer.from(pdf), { headers: headers("application/pdf", "pdf") });
  } catch (err) {
    return errorResponse(err);
  }
}
