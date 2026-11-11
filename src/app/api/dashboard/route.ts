import { errorResponse } from "@/lib/errors";
import { dashboardStats, purgeExpired } from "@/lib/store";
import { ownerFromRequest } from "@/lib/owner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    await purgeExpired().catch(() => 0);
    return Response.json(await dashboardStats(ownerFromRequest(req)), { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return errorResponse(err);
  }
}
