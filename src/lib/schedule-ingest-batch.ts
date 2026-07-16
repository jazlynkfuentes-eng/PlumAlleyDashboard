import { after } from "next/server";

import {
  needsNextIngestBatch,
  type DailyIngestResult,
} from "@/lib/ingest";

/**
 * After the current response is sent, POST the next batch as a separate request
 * so no single Amplify invocation runs the full company list.
 *
 * Pass `enabled: false` when the client will chain batches itself (e.g. Refresh).
 */
export function scheduleNextIngestBatch(
  req: Request,
  result: Pick<
    DailyIngestResult,
    "skipped" | "done" | "nextBatchIndex" | "runId"
  >,
  options?: { enabled?: boolean },
) {
  if (options?.enabled === false) return;
  if (!needsNextIngestBatch(result)) return;
  if (result.nextBatchIndex == null) return;

  const url = new URL("/api/jobs/daily-ingest", req.url);
  const secret = process.env.CRON_SECRET ?? "dev-cron-secret";
  const { runId, nextBatchIndex } = result;

  after(() => {
    void fetch(url.toString(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${secret}`,
      },
      body: JSON.stringify({ runId, batchIndex: nextBatchIndex }),
    }).catch((err) => {
      console.error("[ingest] failed to trigger next batch", err);
    });
  });
}
