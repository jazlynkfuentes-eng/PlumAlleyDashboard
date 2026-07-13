import { NextResponse } from "next/server";

import { verifyUpdateDates } from "@/lib/date-agent";
import { getSystemClock } from "@/lib/utils";

/** Lightweight clock snapshot for the UI / agents. */
export async function GET() {

  return NextResponse.json({ clock: getSystemClock() });
}

/**
 * Date verification agent.
 * POST { autoFix?: boolean, limit?: number, companySlug?: string }
 * Uses this machine's OS clock and re-checks source URLs when possible.
 */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  try {
    const result = await verifyUpdateDates({
      autoFix: body.autoFix === true,
      limit: typeof body.limit === "number" ? body.limit : 40,
      companySlug:
        typeof body.companySlug === "string" ? body.companySlug : undefined,
    });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Date verify failed" },
      { status: 500 },
    );
  }
}
