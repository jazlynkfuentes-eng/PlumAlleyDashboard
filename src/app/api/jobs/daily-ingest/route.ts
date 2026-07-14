import { NextResponse } from "next/server";

import { runDailyIngest } from "@/lib/ingest";

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

  try {
    const result = await runDailyIngest({ companySlug, force });
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
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Ingest failed" },
      { status: 500 },
    );
  }
}
