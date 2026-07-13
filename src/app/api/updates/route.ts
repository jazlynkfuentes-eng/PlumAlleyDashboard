import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { ingestMany, ingestUpdateRow, type IngestUpdateInput } from "@/lib/ingest-shared";

function authorized(req: Request) {
  const header = req.headers.get("authorization") ?? "";
  const bearer = header.startsWith("Bearer ") ? header.slice(7) : "";
  const ingestSecret = process.env.INGEST_SECRET ?? process.env.CRON_SECRET ?? "dev-cron-secret";
  return bearer === ingestSecret;
}

/**
 * Shared ingestion endpoint for website fetchers (internal) and n8n LinkedIn (external).
 * Body: single Update or { updates: Update[] }
 * Fields: company_id|companyId|company_name|companySlug, source_type, content, source_url, published_at
 */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user && !authorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const rowsRaw = Array.isArray(body.updates) ? body.updates : [body];
  const rows: IngestUpdateInput[] = rowsRaw.map((r: Record<string, unknown>) => ({
    companyId: (r.company_id ?? r.companyId) as string | undefined,
    companySlug: (r.company_slug ?? r.companySlug) as string | undefined,
    companyName: (r.company_name ?? r.companyName) as string | undefined,
    sourceType: "linkedin",
    content: String(r.content ?? r.post_content ?? r.excerpt ?? ""),
    sourceUrl: String(r.source_url ?? r.sourceUrl ?? r.post_url ?? ""),
    publishedAt: (r.published_at ?? r.publishedAt ?? null) as string | null,
    title: (r.title as string | undefined) ?? null,
    excerpt: (r.excerpt as string | undefined) ?? null,
    rawSource: r.raw_source ?? r.rawSource,
    publishedAtPrecision: r.published_at_precision as
      | "datetime"
      | "date"
      | "unknown"
      | undefined,
    fetchStrategy: (r.fetch_strategy ?? r.fetchStrategy) as string | undefined,
    externalId: (r.external_id ?? r.externalId) as string | undefined,
    dateVerifyNote: (r.date_verify_note ?? r.dateVerifyNote) as string | undefined,
  }));

  const rejected = rowsRaw.filter((r: Record<string, unknown>) => {
    const t = String(r.source_type ?? r.sourceType ?? "linkedin").toLowerCase();
    return t === "website";
  });
  if (rejected.length && rowsRaw.length === rejected.length) {
    return NextResponse.json(
      { error: "website_source_disabled", message: "Dashboard is LinkedIn-only" },
      { status: 400 },
    );
  }

  if (rows.length === 1) {
    const result = await ingestUpdateRow(rows[0]!);
    if (!result.ok) {
      return NextResponse.json(result, { status: 400 });
    }
    return NextResponse.json(result);
  }

  const batch = await ingestMany(rows);
  return NextResponse.json(batch);
}
