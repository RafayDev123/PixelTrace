import { randomUUID } from "node:crypto";
import { analyzeUpload } from "@/lib/pipeline";
import { mapLimit, rateLimit, readFormFiles } from "@/lib/api-utils";
import { config } from "@/lib/config";
import { AppError, errorResponse } from "@/lib/errors";
import type { AnalysisResult } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

type Item =
  | { filename: string; status: "ok"; analysis: AnalysisResult }
  | { filename: string; status: "error"; error: { code: string; message: string } };

export async function POST(req: Request) {
  try {
    rateLimit(req, 2);
    const { files } = await readFormFiles(req, config.maxFiles);
    if (files.length === 0) throw new AppError(400, "no_file", "No images were uploaded. Send them in repeated 'files' fields.");
    if (files.length > config.maxFiles)
      throw new AppError(413, "too_many_files", `A batch may contain at most ${config.maxFiles} images.`);
    const sessionId = randomUUID();
    // Bounded concurrency; one failing image never aborts the batch.
    const results = await mapLimit<File, Item>(files, config.bulkConcurrency, async (file) => {
      try {
        const buffer = Buffer.from(await file.arrayBuffer());
        const analysis = await analyzeUpload({ filename: file.name, buffer, sessionId });
        return { filename: file.name, status: "ok", analysis };
      } catch (err) {
        if (err instanceof AppError) return { filename: file.name, status: "error", error: { code: err.code, message: err.message } };
        return { filename: file.name, status: "error", error: { code: "internal_error", message: "Analysis failed for this image." } };
      }
    });
    const ok = results.filter((r) => r.status === "ok");
    const hashes = new Map<string, number>();
    for (const r of ok) if (r.status === "ok") hashes.set(r.analysis.file.sha256, (hashes.get(r.analysis.file.sha256) ?? 0) + 1);
    return Response.json(
      {
        sessionId,
        results,
        summary: {
          total: results.length,
          succeeded: ok.length,
          failed: results.length - ok.length,
          duplicateGroups: [...hashes.values()].filter((n) => n > 1).length,
        },
      },
      { status: 200 },
    );
  } catch (err) {
    return errorResponse(err);
  }
}
