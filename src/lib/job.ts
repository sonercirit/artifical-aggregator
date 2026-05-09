import {
  ARTIFICIAL_ANALYSIS_URL,
  parseHtmlToResults,
} from "./aa";
import {
  completeFetchRun,
  createFetchRun,
  failFetchRun,
  getActiveRun,
  storeModelResults,
  storeRawHtmlChunks,
} from "./db";
import { gzipStringToBase64Chunks, sha256Hex } from "./storage";
import type { Bindings } from "../types";

export type FetchJobResult = {
  runId: number | null;
  skipped: boolean;
  reason?: string;
  modelCount?: number;
  resultCount?: number;
};

export async function runFetchJob(
  env: Bindings,
  options: { force?: boolean } = {},
): Promise<FetchJobResult> {
  if (!options.force) {
    const activeRun = await getActiveRun(env);
    if (activeRun) {
      return {
        runId: activeRun.id,
        skipped: true,
        reason: `run ${activeRun.id} is still marked running`,
      };
    }
  }

  const started = Date.now();
  const sourceUrl = env.AA_SOURCE_URL || ARTIFICIAL_ANALYSIS_URL;
  const runId = await createFetchRun(env, sourceUrl);

  let httpStatus: number | null = null;
  let htmlBytes: number | null = null;
  let htmlSha256: string | null = null;
  let htmlGzipBytes: number | null = null;

  try {
    const response = await fetch(sourceUrl, {
      headers: {
        accept: "text/html,application/xhtml+xml",
        "user-agent":
          "artificial-aggrerator/0.1 (+https://workers.cloudflare.com/)",
      },
      redirect: "follow",
    });

    httpStatus = response.status;
    const html = await response.text();
    const compressed = await gzipStringToBase64Chunks(html);

    htmlBytes = compressed.originalBytes;
    htmlGzipBytes = compressed.gzipBytes;
    htmlSha256 = await sha256Hex(html);

    // Store the exact fetched HTML before parsing so failed parser runs are
    // still auditable.
    await storeRawHtmlChunks(env, runId, compressed.chunks);

    if (!response.ok) {
      throw new Error(`Artificial Analysis returned HTTP ${response.status}`);
    }

    const results = parseHtmlToResults(html);
    await storeModelResults(env, runId, results);

    await completeFetchRun(env, runId, {
      durationMs: Date.now() - started,
      httpStatus,
      htmlBytes,
      htmlSha256,
      htmlGzipBytes,
      modelCount: results.length,
      resultCount: results.length,
    });

    return {
      runId,
      skipped: false,
      modelCount: results.length,
      resultCount: results.length,
    };
  } catch (error) {
    await failFetchRun(env, runId, {
      error: error instanceof Error ? error.message : String(error),
      durationMs: Date.now() - started,
      httpStatus,
      htmlBytes,
      htmlSha256,
      htmlGzipBytes,
    });
    throw error;
  }
}
