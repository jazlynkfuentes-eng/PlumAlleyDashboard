import { NextResponse } from "next/server";

import {
  regenerateCompanyIntelligenceSummariesBatch,
  SUMMARY_REGEN_BATCH_SIZE,
} from "@/lib/ai";
import { scheduleNextSummaryBatch } from "@/lib/schedule-summary-regen";

/**
 * Amplify Web Compute hard-caps SSR/API at ~30s; `maxDuration` is explicit
 * for platforms that honor it (e.g. Vercel). Amplify does not support
 * Next.js `after()`, so client-driven chaining is the reliable path there.
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
  if (!authorized(req)) {
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

  const force = body.force === true;
  const offset =
    typeof body.offset === "number" && Number.isFinite(body.offset)
      ? body.offset
      : 0;
  const limit =
    typeof body.limit === "number" && Number.isFinite(body.limit)
      ? body.limit
      : SUMMARY_REGEN_BATCH_SIZE;
  const chain = body.chain !== false;

  try {
    const result = await regenerateCompanyIntelligenceSummariesBatch({
      force,
      offset,
      limit,
    });
    scheduleNextSummaryBatch(req, result, { enabled: chain });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      {
        error:
          e instanceof Error ? e.message : "Summary regeneration failed",
      },
      { status: 500 },
    );
  }
}
