import { after } from "next/server";

import { SUMMARY_REGEN_BATCH_SIZE } from "@/lib/ai";

function cronSecret() {
  return (
    process.env.INGEST_SECRET ??
    process.env.CRON_SECRET ??
    process.env.NEXT_PUBLIC_CRON_SECRET ??
    "dev-cron-secret"
  );
}

/**
 * After the response is sent, POST the next summary-regen batch.
 * Pass enabled:false when the client (Refresh button) chains batches itself.
 */
export function scheduleNextSummaryBatch(
  req: Request,
  result: {
    done: boolean;
    nextOffset: number | null;
    force: boolean;
  },
  options?: { enabled?: boolean },
) {
  if (options?.enabled === false) return;
  if (result.done || result.nextOffset == null) return;

  const url = new URL("/api/jobs/regenerate-summaries", req.url);
  const { nextOffset, force } = result;

  after(() => {
    void fetch(url.toString(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cronSecret()}`,
      },
      body: JSON.stringify({
        force,
        offset: nextOffset,
        limit: SUMMARY_REGEN_BATCH_SIZE,
        chain: true,
      }),
    }).catch((err) => {
      console.error("[intelligence-summary] failed to trigger next batch", err);
    });
  });
}

/**
 * Kick off summary regeneration after a full ingest run completes.
 * First batch runs in after(); subsequent batches chain via the API route.
 */
export function scheduleSummaryRegenAfterIngest(
  req: Request,
  options: { force: boolean; enabled?: boolean },
) {
  if (options.enabled === false) return;

  const url = new URL("/api/jobs/regenerate-summaries", req.url);
  after(() => {
    void fetch(url.toString(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cronSecret()}`,
      },
      body: JSON.stringify({
        force: options.force,
        offset: 0,
        limit: SUMMARY_REGEN_BATCH_SIZE,
        chain: true,
      }),
    }).catch((err) => {
      console.error("[intelligence-summary] failed to start regen chain", err);
    });
  });
}
