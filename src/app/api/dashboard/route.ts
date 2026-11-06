import { errorResponse } from "@/lib/errors";
import { dashboardStats, purgeExpired } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await purgeExpired().catch(() => 0);
    return Response.json(await dashboardStats(), { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return errorResponse(err);
  }
}
