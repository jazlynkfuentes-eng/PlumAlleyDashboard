import { NextResponse } from "next/server";

import { runDailyIngest } from "@/lib/ingest";
import { scheduleNextIngestBatch } from "@/lib/schedule-ingest-batch";

function authorized(req: Request) {
  const header = req.headers.get("authorization") ?? "";
  const bearer = header.startsWith("Bearer ") ? header.slice(7) : "";
  const cronHeader = req.headers.get("x-cron-secret") ?? "";
  const cronSecret = process.env.CRON_SECRET ?? "dev-cron-secret";
  return bearer === cronSecret || cronHeader === cronSecret;
}

export async function POST(req: Request) {
  const isCron = authorized(req);
  if (!isCron) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
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
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Ingest failed" },
      { status: 500 },
    );
  }
}
