import { errorResponse, AppError } from "@/lib/errors";
import { maskResult, parseReveal } from "@/lib/mask";
import { ownerFromRequest } from "@/lib/owner";
import { deleteAnalysis, getAnalysis, isUuid } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    if (!isUuid(id)) throw new AppError(400, "invalid_id", "Analysis id is not valid.");
    const result = await getAnalysis(id, ownerFromRequest(req));
    if (!result) throw new AppError(404, "not_found", "Analysis not found. It may have been deleted or expired.");
    const reveal = parseReveal(new URL(req.url).searchParams);
    return Response.json(maskResult(result, reveal), { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    if (!isUuid(id)) throw new AppError(400, "invalid_id", "Analysis id is not valid.");
    const ok = await deleteAnalysis(id, ownerFromRequest(req));
    if (!ok) throw new AppError(404, "not_found", "Analysis not found.");
    return Response.json({ deleted: true });
  } catch (err) {
    return errorResponse(err);
  }
}
