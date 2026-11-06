import { config, getLimits } from "@/lib/config";
import { errorResponse, AppError } from "@/lib/errors";
import { getSettings, purgeExpired, updateSettings } from "@/lib/store";
import type { SettingsResponse } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function snapshot(): Promise<SettingsResponse> {
  return {
    settings: await getSettings(),
    limits: getLimits(),
    cloud: {
      enabled: config.cloud.enabled,
      note: config.cloud.enabled
        ? "Cloud mode flag is set, but no storage provider is wired in this build."
        : "Cloud storage is disabled. Nothing is sent to third-party services.",
    },
    engine: { metadata: "exifr", imaging: "sharp / libvips", heicSupported: false },
  };
}

export async function GET() {
  try {
    return Response.json(await snapshot(), { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function PUT(req: Request) {
  try {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      throw new AppError(400, "invalid_body", "Body must be JSON.");
    }
    await updateSettings(body);
    return Response.json(await snapshot());
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(req: Request) {
  try {
    const action = new URL(req.url).searchParams.get("action");
    if (action !== "purge") throw new AppError(400, "unknown_action", "Unknown action.");
    const removed = await purgeExpired(true);
    return Response.json({ removed });
  } catch (err) {
    return errorResponse(err);
  }
}
