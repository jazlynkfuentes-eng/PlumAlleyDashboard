import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { ensureDailyIngest } from "@/lib/ingest";

/** Once-per-day automatic refresh triggered when the owner opens the app. */
export async function POST() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await ensureDailyIngest();
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Ensure daily failed" },
      { status: 500 },
    );
  }
}
