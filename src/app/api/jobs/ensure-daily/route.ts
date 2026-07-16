import { NextResponse } from "next/server";

import { ensureDailyIngest } from "@/lib/ingest";
import { scheduleNextIngestBatch } from "@/lib/schedule-ingest-batch";

/**
 * Once-per-day automatic refresh triggered when the owner opens the app.
 * Processes one batch per call; schedules the next batch via a separate request
 * (and DailyAutoRefresh also continues until done as a fallback).
 */
export async function POST(req: Request) {
  try {
    const result = await ensureDailyIngest();
    scheduleNextIngestBatch(req, result);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Ensure daily failed" },
      { status: 500 },
    );
  }
}
