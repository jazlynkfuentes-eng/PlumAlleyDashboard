import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";

function authorized(req: Request) {
  const header = req.headers.get("authorization") ?? "";
  const bearer = header.startsWith("Bearer ") ? header.slice(7) : "";
  const ingestSecret =
    process.env.INGEST_SECRET ?? process.env.CRON_SECRET ?? "dev-cron-secret";
  return bearer === ingestSecret;
}

export async function GET(req: Request) {


  const { searchParams } = new URL(req.url);
  const limit = Math.min(Math.max(Number(searchParams.get("limit") ?? "1"), 1), 20);

  const rows = await prisma.update.findMany({
    where: { sourceType: "linkedin", rawSource: { not: null } },
    orderBy: { fetchedAt: "desc" },
    take: limit,
    select: {
      id: true,
      sourceUrl: true,
      publishedAt: true,
      rawSource: true,
      rawSourceSha: true,
      company: { select: { slug: true, name: true } },
    },
  });

  return NextResponse.json({
    count: rows.length,
    items: rows.map((r) => ({
      id: r.id,
      company: r.company,
      sourceUrl: r.sourceUrl,
      publishedAt: r.publishedAt.toISOString(),
      rawSourceSha: r.rawSourceSha,
      rawSource: r.rawSource,
    })),
  });
}

