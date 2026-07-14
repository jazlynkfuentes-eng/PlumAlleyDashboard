import { Suspense } from "react";
import { prisma } from "@/lib/prisma";
import {
  endOfLocalDay,
  formatLongDay,
  parseDateParam,
  startOfLocalDay,
  toDateInputValue,
} from "@/lib/utils";
import { UpdateFeed } from "@/components/update-feed";
import { FeedFilters } from "@/components/feed-filters";
import { RefreshButton } from "@/components/refresh-button";
import { DailyAutoRefresh } from "@/components/daily-auto-refresh";
import Link from "next/link";
import AccessGate from '@/components/AccessGate';
export const dynamic = "force-dynamic";

type SearchParams = Promise<{
  date?: string;
  company?: string;
  q?: string;
}>;

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sp = await searchParams;
  const selectedDate = parseDateParam(sp.date) ?? new Date();
  const from = startOfLocalDay(selectedDate);
  const to = endOfLocalDay(selectedDate);
  const dateLabel = formatLongDay(selectedDate);
  const isToday = toDateInputValue(selectedDate) === toDateInputValue();

let companies: any[] = [];
let updates: any[] = [];
let summaries: any[] = [];
let lastRun: any = null;
let companyFilter: any = null;
let keyword: string | undefined = undefined;

try {
  companies = await prisma.company.findMany({
    where: { linkedinUrl: { not: null } },
    orderBy: { name: "asc" },
    select: { id: true, slug: true, name: true },
  });

  companyFilter = sp.company
    ? companies.find((c) => c.slug === sp.company)
    : null;

  keyword = sp.q?.trim();

  // Default feed: show recent activity (last 14 days) when viewing "today"
  // so the timeline isn't empty before ingest — date filter still narrows to one day when set.
  const feedFrom = sp.date ? from : startOfLocalDay(new Date(Date.now() - 13 * 24 * 60 * 60 * 1000));
  const feedTo = to;

  updates = await prisma.update.findMany({
    where: {
      sourceType: "linkedin",
      rawSource: { not: null },
      publishedAt: { gte: feedFrom, lte: feedTo },
      ...(companyFilter ? { companyId: companyFilter.id } : {}),
      ...(keyword
        ? {
            OR: [
              { excerpt: { contains: keyword } },
              { title: { contains: keyword } },
              { content: { contains: keyword } },
              { company: { name: { contains: keyword } } },
            ],
          }
        : {}),
    },
    include: {
      company: { select: { name: true, slug: true, sector: true } },
    },
    orderBy: { publishedAt: "desc" },
    take: 100,
  });

  summaries = await prisma.dailySummary.findMany({
    where: {
      summaryDate: from,
      ...(companyFilter ? { companyId: companyFilter.id } : {}),
      company: { linkedinUrl: { not: null } },
    },
    include: { company: true },
    orderBy: { company: { name: "asc" } },
  });

  lastRun = await prisma.ingestRun.findFirst({
    orderBy: { startedAt: "desc" },
  });
} catch (e) {
  console.error("Homepage DB error:", e);
  // placeholders remain empty
}

  const { cookies } = require('next/headers');
  const cookieStore = cookies();
  const accessGranted = cookieStore.get('access_granted');
  if (!accessGranted) {
    return <AccessGate />;
  }
  return (
    <div className="px-8 py-8">
      <DailyAutoRefresh />
      <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm uppercase tracking-[0.14em] text-[var(--grey)]">
            Dashboard
          </p>
          <h1 className="mt-2 text-4xl font-black tracking-tight">
            {isToday ? "Today's Feed" : "Portfolio Feed"}
          </h1>
          <p className="mt-2 text-[var(--grey)]">{dateLabel}</p>
          <p className="mt-1 text-sm text-[var(--grey)]">
            System clock:{" "}
            {new Date().toLocaleString(undefined, {
              weekday: "short",
              month: "short",
              day: "numeric",
              year: "numeric",
              hour: "numeric",
              minute: "2-digit",
              timeZoneName: "short",
            })}
          </p>
          <p className="mt-2 max-w-2xl text-[var(--grey)]">
            Official LinkedIn company-page posts only — chronologically, with direct source
            links. Date-only posts show the calendar day (no fake 12:00 AM); timed posts show
            the real publish time.
          </p>
          {lastRun && (
            <p className="mt-2 text-sm text-[var(--grey)]">
              Last auto/manual refresh:{" "}
              {lastRun.startedAt.toLocaleString(undefined, {
                weekday: "short",
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
              })}{" "}
              · {lastRun.status}
            </p>
          )}
        </div>
        <RefreshButton />
      </header>

      <section className="mb-10">
        <div className="mb-4 flex items-end justify-between gap-4">
          <h2 className="text-2xl font-bold">
            {isToday ? "Today's Portfolio Digest" : `Digest · ${dateLabel}`}
          </h2>
          <Link href="/ai" className="text-sm underline underline-offset-4">
            Open AI Agent
          </Link>
        </div>
        {summaries.length === 0 ? (
          <div className="border border-[var(--border)] px-5 py-8 text-[var(--grey)]">
            No AI summaries for this day yet. LinkedIn posts arrive from the n8n workflow
            (or Refresh now when <code>APIFY_TOKEN</code> is set).
          </div>
        ) : (
          <div className="space-y-3">
            {summaries.map((s) => (
              <article key={s.id} className="border border-[var(--border)] px-5 py-4">
                <Link
                  href={`/companies/${s.company.slug}`}
                  className="font-bold hover:underline"
                >
                  {s.company.name}
                </Link>
                <p className="mt-2 text-[17px] leading-relaxed text-[var(--grey)]">
                  {s.content}
                </p>
              </article>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-4 text-2xl font-bold">
          {sp.date ? "Feed for this date" : "Recent feed (last 14 days)"}
        </h2>
        <Suspense fallback={<div className="h-24 border border-[var(--border)]" />}>
          <FeedFilters
            companies={companies.map((c) => ({ slug: c.slug, name: c.name }))}
            defaultDate={toDateInputValue(selectedDate)}
          />
        </Suspense>
        <div className="mt-4">
          <UpdateFeed items={updates} />
        </div>
      </section>
    </div>
  );
}
