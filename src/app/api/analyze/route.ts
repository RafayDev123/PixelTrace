import { analyzeUpload } from "@/lib/pipeline";
import { rateLimit, readFormFiles } from "@/lib/api-utils";
import { AppError, errorResponse } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const SESSION_RE = /^[A-Za-z0-9-]{8,64}$/;

export async function POST(req: Request) {
  try {
    rateLimit(req);
    const { files, form } = await readFormFiles(req, 1);
    if (files.length === 0) throw new AppError(400, "no_file", "No image was uploaded. Send it in a 'file' field.");
    if (files.length > 1) throw new AppError(400, "too_many_files", "Use /api/analyze/bulk to analyse several images.");
    const file = files[0];
    const sid = form.get("sessionId");
    const sessionId = typeof sid === "string" && SESSION_RE.test(sid) ? sid : undefined;
    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await analyzeUpload({ filename: file.name, buffer, sessionId });
    return Response.json(result, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
