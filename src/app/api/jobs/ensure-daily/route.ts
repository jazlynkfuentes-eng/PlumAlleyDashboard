import { NextResponse } from "next/server";

import { ensureDailyIngest } from "@/lib/ingest";
import { scheduleNextIngestBatch } from "@/lib/schedule-ingest-batch";
import { scheduleSummaryRegenAfterIngest } from "@/lib/schedule-summary-regen";

/**
 * Once-per-day automatic refresh triggered when the owner opens the app.
 * Processes one batch per call; schedules the next batch via a separate request
 * (and DailyAutoRefresh also continues until done as a fallback).
 *
 * Amplify Hosting does not support Next.js `after()`, so DailyAutoRefresh's
 * client-side loop is the reliable continuation mechanism there.
 */
export async function POST(req: Request) {
  try {
    const result = await ensureDailyIngest();
    scheduleNextIngestBatch(req, result);
    if (result.done && result.summaryRegen) {
      scheduleSummaryRegenAfterIngest(req, {
        force: result.summaryRegen.force,
        enabled: true,
      });
    }
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Ensure daily failed" },
      { status: 500 },
    );
  }
}
