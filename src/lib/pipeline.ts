import { buildAnalysis, type AnalyzeInput } from "./analyze";
import { maskResult } from "./mask";
import { findDuplicates, getSettings, purgeExpired, saveAnalysis } from "./store";
import type { AnalysisResult } from "./types";

/**
 * Full pipeline with persistence. Stores the metadata report (never the uploaded file)
 * and returns the MASKED result: GPS coordinates and serial numbers are withheld.
 */
export async function analyzeUpload(input: AnalyzeInput, ownerId: string): Promise<AnalysisResult> {
  await purgeExpired().catch(() => 0);
  const settings = await getSettings();
  const { result, thumbnail } = await buildAnalysis(input, {
    persisted: settings.saveHistory,
    duplicates: (sha256, sessionId) => findDuplicates(sha256, sessionId, ownerId),
  });
  // Session-only reports always keep a preview (purged within an hour); history honours the setting.
  const storeThumb = !result.persisted || settings.storeThumbnail;
  await saveAnalysis(result, { thumbnail: storeThumb ? thumbnail : null, ownerId });
  return maskResult({ ...result, thumbnail: storeThumb ? thumbnail : null });
}
