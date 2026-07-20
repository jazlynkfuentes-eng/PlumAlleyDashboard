import { NextResponse } from "next/server";

import { runDailyIngest } from "@/lib/ingest";
import { scheduleNextIngestBatch } from "@/lib/schedule-ingest-batch";
import { scheduleSummaryRegenAfterIngest } from "@/lib/schedule-summary-regen";

/**
 * Prefer staying under Amplify's hard ~30s Web Compute timeout.
 * `maxDuration` is honored on Vercel; Amplify ignores/caps it at ~30s.
 * Amplify also does not support Next.js `after()` — client-driven chaining
 * (RefreshButton / DailyAutoRefresh) is the reliable path there.
 */
export const maxDuration = 30;

function authorized(req: Request) {
  const header = req.headers.get("authorization") ?? "";
  const bearer = header.startsWith("Bearer ") ? header.slice(7) : "";
  const cronHeader = req.headers.get("x-cron-secret") ?? "";
  const secrets = [
    process.env.CRON_SECRET,
    process.env.INGEST_SECRET,
    process.env.NEXT_PUBLIC_CRON_SECRET,
    "dev-cron-secret",
  ].filter((s): s is string => Boolean(s));
  return secrets.includes(bearer) || secrets.includes(cronHeader);
}

export async function POST(req: Request) {
  const isCron = authorized(req);
  if (!isCron) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown> = {};
  try {
    const parsed = await req.json();
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      body = parsed as Record<string, unknown>;
    }
  } catch {
    body = {};
  }

  const companySlug =
    typeof body.companySlug === "string" ? body.companySlug : undefined;
  const force = body.force === true;
  const runId = typeof body.runId === "string" ? body.runId : undefined;
  const batchIndex =
    typeof body.batchIndex === "number" && Number.isFinite(body.batchIndex)
      ? body.batchIndex
      : undefined;
  // Client-driven loops (Refresh button) pass chain:false to avoid double-trigger.
  const chain = body.chain !== false;

  try {
    const result = await runDailyIngest({
      companySlug,
      force,
      runId,
      batchIndex,
    });
    scheduleNextIngestBatch(req, result, { enabled: chain });
    // Server-chained paths (cron / ensure-daily) kick off summary regen after last ingest batch.
    // Refresh button passes chain:false and drives summary regen itself.
    if (result.done && result.summaryRegen) {
      scheduleSummaryRegenAfterIngest(req, {
        force: result.summaryRegen.force,
        enabled: chain,
      });
    }
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Ingest failed" },
      { status: 500 },
    );
  }
}

/** Vercel Cron hits GET with Authorization: Bearer CRON_SECRET */
export async function GET(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runDailyIngest({ force: true });
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
      { error: e instanceof Error ? e.message : "Ingest failed" },
      { status: 500 },
    );
  }
}
