import { ApifyClient } from "apify-client";
import { createHash } from "crypto";
import { prisma } from "@/lib/prisma";
import { generateCompanySummary, regenerateCompanyIntelligenceSummaries } from "@/lib/ai";
import { coercePublishedAt, startOfLocalDay } from "@/lib/utils";
import { ingestUpdateRow } from "@/lib/ingest-shared";
import {
  authorMatchesCompany,
  normalizeLinkedInCompanyUrl,
} from "@/lib/linkedin-validate";
import {
  ingestCompanyWebsite,
  type WebsiteIngestReport,
} from "@/lib/website-ingest";
import type { Company } from "@prisma/client";

function hashId(input: string) {
  return createHash("sha256").update(input).digest("hex").slice(0, 24);
}

type MappedLinkedInItem = NonNullable<ReturnType<typeof mapLinkedInItem>>;

/**
 * LinkedIn via Apify company-page posts actor (NOT post-search).
 * Primary path is n8n → POST /api/updates/linkedin.
 * In-app path runs when APIFY_TOKEN is set (optional LINKEDIN_VIA_APP=1 historically; now default on).
 */
async function fetchLinkedInCompanyPagePosts(company: Company) {
  const token = process.env.APIFY_TOKEN;
  if (!token || !company.linkedinUrl) {
    return { items: [] as MappedLinkedInItem[], filtered: 0 };
  }

  const companyUrl = normalizeLinkedInCompanyUrl(company.linkedinUrl);
  const client = new ApifyClient({ token });

  const run = await client.actor("harvestapi/linkedin-company-posts").call(
    {
      targetUrls: [companyUrl],
      maxPosts: 10,
      includeReposts: false,
      scrapeReactions: false,
      scrapeComments: false,
    },
    { waitSecs: 180 },
  );

  const { items } = await client.dataset(run.defaultDatasetId).listItems();
  const mapped: MappedLinkedInItem[] = [];
  let filtered = 0;

  for (const raw of items as Record<string, unknown>[]) {
    const item = mapLinkedInItem(raw, companyUrl);
    if (!item) {
      filtered += 1;
      continue;
    }
    mapped.push(item);
  }

  return { items: mapped, filtered };
}

function mapLinkedInItem(item: Record<string, unknown>, companyUrl: string) {
  const author = (item.author ?? {}) as Record<string, unknown>;
  const authorUrl = String(
    author.linkedinUrl ?? author.url ?? author.companyUrl ?? "",
  );
  const authorType = String(author.type ?? "").toLowerCase();

  if (authorUrl && !authorMatchesCompany(authorUrl, companyUrl)) {
    return null;
  }
  if (authorType && authorType !== "company" && authorUrl && !authorUrl.includes("/company/")) {
    return null;
  }

  const text = String(item.content ?? item.text ?? item.postText ?? "").trim();
  const postUrl = String(item.linkedinUrl ?? item.url ?? item.postUrl ?? "").trim();
  if (!text || !postUrl) return null;

  const postedAt = item.postedAt as Record<string, unknown> | string | number | undefined;
  const rawDate =
    typeof postedAt === "object" && postedAt
      ? (postedAt.date ?? postedAt.timestamp)
      : postedAt;

  const coerced = coercePublishedAt(
    rawDate ?? item.publishedAt ?? item.timestamp ?? item.postedDate,
  );
  if (!coerced) return null;

  return {
    content: text,
    sourceUrl: postUrl,
    publishedAt: coerced.date.toISOString(),
    publishedAtPrecision: coerced.precision,
    title: text.slice(0, 80),
    excerpt: text.slice(0, 500),
    externalId: String(item.id ?? hashId(postUrl)),
    authorUrl,
    rawSource: item,
  };
}

export type IngestReport = {
  companySlug: string;
  linkedin: number;
  linkedinFiltered: number;
  website: number;
  websiteStrategy?: string | null;
  error?: string;
};

/** LinkedIn-only company ingest (Apify). Does not fetch websites. */
export async function ingestCompanyLinkedIn(
  company: Company,
): Promise<Pick<IngestReport, "linkedin" | "linkedinFiltered" | "error">> {
  const report = {
    linkedin: 0,
    linkedinFiltered: 0,
    error: undefined as string | undefined,
  };

  if (!company.linkedinUrl) {
    return report;
  }

  if (!process.env.APIFY_TOKEN) {
    // n8n → /api/updates/linkedin is the primary LinkedIn path; silent skip
    return report;
  }

  // Skip in-app Apify if LINKEDIN_VIA_APP is explicitly "0" (n8n-only mode)
  if (process.env.LINKEDIN_VIA_APP === "0") {
    return report;
  }

  try {
    const { items, filtered } = await fetchLinkedInCompanyPagePosts(company);
    report.linkedinFiltered = filtered;
    for (const item of items) {
      const row = await ingestUpdateRow({
        companyId: company.id,
        sourceType: "linkedin",
        content: item.content,
        sourceUrl: item.sourceUrl,
        publishedAt: item.publishedAt,
        title: item.title,
        excerpt: item.excerpt,
        publishedAtPrecision: item.publishedAtPrecision,
        fetchStrategy: "apify_company_posts",
        externalId: item.externalId,
        rawSource: item.rawSource,
      });
      if (row.ok && row.inserted) report.linkedin += 1;
    }

    await prisma.company.update({
      where: { id: company.id },
      data: { lastFetchedAt: new Date(), lastError: null },
    });

    try {
      await generateCompanySummary(company.id);
    } catch {
      /* optional */
    }
  } catch (e) {
    report.error = `LinkedIn: ${e instanceof Error ? e.message : "failed"}`;
    await prisma.company.update({
      where: { id: company.id },
      data: { lastError: report.error, lastFetchedAt: new Date() },
    });
  }

  return report;
}

/** Combined LinkedIn (optional Apify) + website fetch for one company. */
export async function ingestCompany(company: Company): Promise<IngestReport> {
  const report: IngestReport = {
    companySlug: company.slug,
    linkedin: 0,
    linkedinFiltered: 0,
    website: 0,
    websiteStrategy: null,
  };

  const errors: string[] = [];

  if (company.linkedinUrl) {
    const li = await ingestCompanyLinkedIn(company);
    report.linkedin = li.linkedin;
    report.linkedinFiltered = li.linkedinFiltered;
    if (li.error) errors.push(li.error);
  }

  if (company.websiteUrl || company.newsFeedUrl) {
    const web: WebsiteIngestReport = await ingestCompanyWebsite(company);
    report.website = web.website;
    report.websiteStrategy = web.strategy;
    if (web.error) errors.push(web.error);
  }

  if (errors.length) report.error = errors.join(" · ");
  return report;
}

/** Companies per HTTP invocation — keep well under Amplify request timeout. */
export const INGEST_BATCH_SIZE = 3;

type BatchRecord = {
  index: number;
  status: "running" | "completed" | "failed";
  startedAt: string;
  finishedAt: string | null;
  companySlugs: string[];
  reports: IngestReport[];
  error?: string;
};

type BatchedIngestSummary = {
  version: 2;
  batchSize: number;
  totalCompanies: number;
  totalBatches: number;
  /** Next batch index to process (0-based). Equals totalBatches when done. */
  nextBatchIndex: number;
  companySlugs: string[];
  reports: IngestReport[];
  failures: string[];
  batches: BatchRecord[];
  count: number;
  failureCount: number;
  /** When true, intelligence summaries regenerate even if already generated today. */
  forceRegenerateSummaries?: boolean;
};

export type DailyIngestResult = {
  runId: string;
  reports: IngestReport[];
  failures: string[];
  skipped: boolean;
  reason?: "already_ran_today" | "run_already_finished" | "batch_not_ready";
  done: boolean;
  batchIndex: number | null;
  totalBatches: number | null;
  nextBatchIndex: number | null;
  status: string;
  /** When set, caller should kick off (or continue) intelligence summary regen. */
  summaryRegen?: { force: boolean } | null;
};

function emptySummary(partial?: Partial<BatchedIngestSummary>): BatchedIngestSummary {
  return {
    version: 2,
    batchSize: INGEST_BATCH_SIZE,
    totalCompanies: 0,
    totalBatches: 0,
    nextBatchIndex: 0,
    companySlugs: [],
    reports: [],
    failures: [],
    batches: [],
    count: 0,
    failureCount: 0,
    ...partial,
  };
}

function parseBatchedSummary(raw: string): BatchedIngestSummary | null {
  try {
    const parsed = JSON.parse(raw) as Partial<BatchedIngestSummary>;
    if (parsed?.version !== 2 || !Array.isArray(parsed.companySlugs)) return null;
    return emptySummary({
      ...parsed,
      batches: Array.isArray(parsed.batches) ? parsed.batches : [],
      reports: Array.isArray(parsed.reports) ? parsed.reports : [],
      failures: Array.isArray(parsed.failures) ? parsed.failures : [],
    });
  } catch {
    return null;
  }
}

function companyIngestWhere(companySlug?: string) {
  return {
    OR: [
      { linkedinUrl: { not: null } },
      { websiteUrl: { not: null } },
      { newsFeedUrl: { not: null } },
    ],
    ...(companySlug ? { slug: companySlug } : {}),
  };
}

async function ingestCompaniesSequential(companies: Company[]): Promise<IngestReport[]> {
  const reports: IngestReport[] = [];
  for (const company of companies) {
    try {
      reports.push(await ingestCompany(company));
    } catch (e) {
      reports.push({
        companySlug: company.slug,
        linkedin: 0,
        linkedinFiltered: 0,
        website: 0,
        error: e instanceof Error ? e.message : "fatal company error",
      });
    }
  }
  return reports;
}

/** Mark abandoned / timed-out runs so they are not stuck in "running" forever. */
async function failStaleRunningRuns(opts?: { olderThanMs?: number; exceptId?: string }) {
  // Amplify often kills mid-batch; don't leave "running" for hours.
  const olderThanMs = opts?.olderThanMs ?? 15 * 60 * 1000;
  const cutoff = new Date(Date.now() - olderThanMs);
  const stale = await prisma.ingestRun.findMany({
    where: {
      status: "running",
      startedAt: { lt: cutoff },
      ...(opts?.exceptId ? { id: { not: opts.exceptId } } : {}),
    },
    select: { id: true, summaryJson: true },
  });
  for (const row of stale) {
    const summary = parseBatchedSummary(row.summaryJson);
    await prisma.ingestRun.update({
      where: { id: row.id },
      data: {
        status: "failed",
        finishedAt: new Date(),
        summaryJson: JSON.stringify({
          ...(summary ?? { note: "abandoned stale run" }),
          abandonedAt: new Date().toISOString(),
          abandonReason: "stale_running_timeout",
        }),
      },
    });
  }
}

async function abandonRun(runId: string, reason: string) {
  const run = await prisma.ingestRun.findUnique({ where: { id: runId } });
  if (!run || run.status !== "running") return;
  const summary = parseBatchedSummary(run.summaryJson);
  await prisma.ingestRun.update({
    where: { id: runId },
    data: {
      status: "failed",
      finishedAt: new Date(),
      summaryJson: JSON.stringify({
        ...(summary ?? {}),
        abandonedAt: new Date().toISOString(),
        abandonReason: reason,
      }),
    },
  });
}

async function runSingleCompanyIngest(companySlug: string): Promise<DailyIngestResult> {
  const run = await prisma.ingestRun.create({
    data: { status: "running" },
  });

  const companies = await prisma.company.findMany({
    where: companyIngestWhere(companySlug),
    orderBy: { name: "asc" },
  });
  const reports = await ingestCompaniesSequential(companies);
  const failures = reports
    .filter((r) => r.error)
    .map((r) => `${r.companySlug}: ${r.error}`);

  await prisma.ingestRun.update({
    where: { id: run.id },
    data: {
      status: "completed",
      finishedAt: new Date(),
      summaryJson: JSON.stringify({
        version: 2,
        batchSize: 1,
        totalCompanies: reports.length,
        totalBatches: 1,
        nextBatchIndex: 1,
        forceRegenerateSummaries: true,
        companySlugs: companies.map((c) => c.slug),
        reports,
        failures,
        batches: [
          {
            index: 0,
            status: "completed",
            startedAt: run.startedAt.toISOString(),
            finishedAt: new Date().toISOString(),
            companySlugs: companies.map((c) => c.slug),
            reports,
          } satisfies BatchRecord,
        ],
        count: reports.length,
        failureCount: failures.length,
      }),
    },
  });

  if (companies.length > 0) {
    await regenerateCompanyIntelligenceSummaries({
      force: true,
      companyIds: companies.map((c) => c.id),
    });
  }

  return {
    runId: run.id,
    reports,
    failures,
    skipped: false,
    done: true,
    batchIndex: 0,
    totalBatches: 1,
    nextBatchIndex: null,
    status: "completed",
  };
}

async function processIngestBatch(
  runId: string,
  requestedBatchIndex?: number,
): Promise<DailyIngestResult> {
  type Claim =
    | {
        ok: true;
        batchIndex: number;
        batchSlugs: string[];
        batchStartedAt: Date;
        totalBatches: number;
      }
    | {
        ok: false;
        result: DailyIngestResult;
      };

  const claim: Claim = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${runId}))`;

    const run = await tx.ingestRun.findUnique({ where: { id: runId } });
    if (!run) {
      throw new Error(`IngestRun not found: ${runId}`);
    }

    if (run.status === "completed" || run.status === "failed") {
      const summary = parseBatchedSummary(run.summaryJson);
      return {
        ok: false as const,
        result: {
          runId,
          reports: [],
          failures: [],
          skipped: true,
          reason: "run_already_finished" as const,
          done: true,
          batchIndex: null,
          totalBatches: summary?.totalBatches ?? null,
          nextBatchIndex: null,
          status: run.status,
        },
      };
    }

    const summary = parseBatchedSummary(run.summaryJson);
    if (!summary) {
      await tx.ingestRun.update({
        where: { id: runId },
        data: {
          status: "failed",
          finishedAt: new Date(),
          summaryJson: JSON.stringify({
            abandonReason: "invalid_summary",
            abandonedAt: new Date().toISOString(),
          }),
        },
      });
      throw new Error("IngestRun has invalid batched summaryJson");
    }

    const batchIndex = requestedBatchIndex ?? summary.nextBatchIndex;

    if (batchIndex < summary.nextBatchIndex) {
      const done = summary.nextBatchIndex >= summary.totalBatches;
      return {
        ok: false as const,
        result: {
          runId,
          reports: [],
          failures: [],
          skipped: true,
          reason: "batch_not_ready" as const,
          done,
          batchIndex,
          totalBatches: summary.totalBatches,
          nextBatchIndex: done ? null : summary.nextBatchIndex,
          status: done ? "completed" : "running",
        },
      };
    }

    if (batchIndex > summary.nextBatchIndex) {
      return {
        ok: false as const,
        result: {
          runId,
          reports: [],
          failures: [],
          skipped: true,
          reason: "batch_not_ready" as const,
          done: false,
          batchIndex,
          totalBatches: summary.totalBatches,
          nextBatchIndex: summary.nextBatchIndex,
          status: "running",
        },
      };
    }

    if (batchIndex >= summary.totalBatches) {
      await tx.ingestRun.update({
        where: { id: runId },
        data: {
          status: "completed",
          finishedAt: new Date(),
          summaryJson: JSON.stringify(summary),
        },
      });
      return {
        ok: false as const,
        result: {
          runId,
          reports: [],
          failures: [],
          skipped: false,
          done: true,
          batchIndex: null,
          totalBatches: summary.totalBatches,
          nextBatchIndex: null,
          status: "completed",
        },
      };
    }

    const existing = summary.batches.find((b) => b.index === batchIndex);
    if (existing?.status === "running") {
      const startedMs = Date.parse(existing.startedAt);
      const ageMs = Number.isFinite(startedMs) ? Date.now() - startedMs : 0;
      // Another invocation owns this batch — unless it looks abandoned mid-request.
      if (ageMs < 90 * 1000) {
        return {
          ok: false as const,
          result: {
            runId,
            reports: [],
            failures: [],
            skipped: true,
            reason: "batch_not_ready" as const,
            done: false,
            batchIndex,
            totalBatches: summary.totalBatches,
            nextBatchIndex: batchIndex,
            status: "running",
          },
        };
      }
    }
    if (existing?.status === "completed" || existing?.status === "failed") {
      const next = batchIndex + 1;
      const done = next >= summary.totalBatches;
      return {
        ok: false as const,
        result: {
          runId,
          reports: [],
          failures: [],
          skipped: true,
          reason: "batch_not_ready" as const,
          done,
          batchIndex,
          totalBatches: summary.totalBatches,
          nextBatchIndex: done ? null : Math.max(next, summary.nextBatchIndex),
          status: done ? "completed" : "running",
        },
      };
    }

    const start = batchIndex * summary.batchSize;
    const batchSlugs = summary.companySlugs.slice(
      start,
      start + summary.batchSize,
    );
    const batchStartedAt = new Date();
    const claimRecord: BatchRecord = {
      index: batchIndex,
      status: "running",
      startedAt: batchStartedAt.toISOString(),
      finishedAt: null,
      companySlugs: batchSlugs,
      reports: [],
    };
    summary.batches = [
      ...summary.batches.filter((b) => b.index !== batchIndex),
      claimRecord,
    ].sort((a, b) => a.index - b.index);

    await tx.ingestRun.update({
      where: { id: runId },
      data: { status: "running", summaryJson: JSON.stringify(summary) },
    });

    return {
      ok: true as const,
      batchIndex,
      batchSlugs,
      batchStartedAt,
      totalBatches: summary.totalBatches,
    };
  });

  if (!claim.ok) return claim.result;

  const { batchIndex, batchSlugs, batchStartedAt, totalBatches } = claim;

  const companiesRaw = await prisma.company.findMany({
    where: { slug: { in: batchSlugs } },
  });
  const bySlug = new Map(companiesRaw.map((c) => [c.slug, c]));
  const companies = batchSlugs
    .map((slug) => bySlug.get(slug))
    .filter((c): c is Company => Boolean(c));

  let reports: IngestReport[] = [];
  let batchFatal: string | undefined;
  try {
    reports = await ingestCompaniesSequential(companies);
  } catch (e) {
    batchFatal = e instanceof Error ? e.message : "fatal batch error";
  }

  const batchFailures = reports
    .filter((r) => r.error)
    .map((r) => `${r.companySlug}: ${r.error}`);
  if (batchFatal) batchFailures.push(`batch_${batchIndex}: ${batchFatal}`);

  const finishedAt = new Date();
  const batchRecord: BatchRecord = {
    index: batchIndex,
    status: batchFatal ? "failed" : "completed",
    startedAt: batchStartedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    companySlugs: batchSlugs,
    reports,
    ...(batchFatal ? { error: batchFatal } : {}),
  };

  const finalized = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${runId}))`;

    const fresh = await tx.ingestRun.findUnique({ where: { id: runId } });
    if (!fresh) throw new Error(`IngestRun not found: ${runId}`);

    const latest =
      parseBatchedSummary(fresh.summaryJson) ??
      emptySummary({
        totalBatches,
        companySlugs: batchSlugs,
        batchSize: INGEST_BATCH_SIZE,
      });

    const withoutThis = latest.batches.filter((b) => b.index !== batchIndex);
    withoutThis.push(batchRecord);
    withoutThis.sort((a, b) => a.index - b.index);

    const completedBatches = withoutThis.filter(
      (b) => b.status === "completed" || b.status === "failed",
    );
    const allReports = completedBatches.flatMap((b) => b.reports);
    const allFailures = completedBatches.flatMap((b) =>
      b.reports
        .filter((r) => r.error)
        .map((r) => `${r.companySlug}: ${r.error}`)
        .concat(b.error ? [`batch_${b.index}: ${b.error}`] : []),
    );

    const nextBatchIndex = Math.max(latest.nextBatchIndex, batchIndex + 1);
    const done = nextBatchIndex >= latest.totalBatches;
    const nextSummary: BatchedIngestSummary = {
      ...latest,
      nextBatchIndex,
      batches: withoutThis,
      reports: allReports,
      failures: allFailures,
      count: allReports.length,
      failureCount: allFailures.length,
    };

    await tx.ingestRun.update({
      where: { id: runId },
      data: {
        status: done ? "completed" : "running",
        finishedAt: done ? finishedAt : null,
        summaryJson: JSON.stringify(nextSummary),
      },
    });

    return {
      done,
      nextBatchIndex: done ? null : nextBatchIndex,
      totalBatches: nextSummary.totalBatches,
      status: done ? "completed" : "running",
    };
  });

  const result: DailyIngestResult = {
    runId,
    reports,
    failures: batchFailures,
    skipped: false,
    done: finalized.done,
    batchIndex,
    totalBatches: finalized.totalBatches,
    nextBatchIndex: finalized.nextBatchIndex,
    status: finalized.status,
    summaryRegen: null,
  };

  if (finalized.done) {
    const run = await prisma.ingestRun.findUnique({ where: { id: runId } });
    const summary = parseBatchedSummary(run?.summaryJson ?? "");
    const forceRegen = summary?.forceRegenerateSummaries === true;
    result.summaryRegen = { force: forceRegen };
    console.log(
      `[ingest] run ${runId} completed · scheduling intelligence summaries (force=${forceRegen})`,
    );
  }

  return result;
}

async function startBatchedIngestRun(options?: {
  force?: boolean;
}): Promise<DailyIngestResult> {
  const companies = await prisma.company.findMany({
    where: companyIngestWhere(),
    orderBy: { name: "asc" },
  });
  const companySlugs = companies.map((c) => c.slug);
  const batchSize = INGEST_BATCH_SIZE;
  const totalBatches = Math.max(1, Math.ceil(companySlugs.length / batchSize));

  const summary = emptySummary({
    batchSize,
    totalCompanies: companySlugs.length,
    totalBatches: companySlugs.length === 0 ? 0 : totalBatches,
    nextBatchIndex: 0,
    companySlugs,
    forceRegenerateSummaries: options?.force === true,
  });

  // Empty portfolio: complete immediately.
  if (companySlugs.length === 0) {
    const run = await prisma.ingestRun.create({
      data: {
        status: "completed",
        finishedAt: new Date(),
        summaryJson: JSON.stringify({
          ...summary,
          totalBatches: 0,
          nextBatchIndex: 0,
        }),
      },
    });
    return {
      runId: run.id,
      reports: [],
      failures: [],
      skipped: false,
      done: true,
      batchIndex: null,
      totalBatches: 0,
      nextBatchIndex: null,
      status: "completed",
    };
  }

  const run = await prisma.ingestRun.create({
    data: {
      status: "running",
      summaryJson: JSON.stringify(summary),
    },
  });

  return processIngestBatch(run.id, 0);
}

/**
 * Run (or continue) the daily ingest as small batches so each HTTP request
 * stays under Amplify's timeout. Pass runId/batchIndex to continue a run;
 * otherwise starts a new run (or resumes today's incomplete one when !force).
 */
export async function runDailyIngest(options?: {
  companySlug?: string;
  force?: boolean;
  runId?: string;
  batchIndex?: number;
}): Promise<DailyIngestResult> {
  await failStaleRunningRuns();

  if (options?.companySlug) {
    return runSingleCompanyIngest(options.companySlug);
  }

  // Explicit continuation of an in-progress batched run.
  if (options?.runId) {
    return processIngestBatch(options.runId, options.batchIndex);
  }

  const todayStart = startOfLocalDay();
  const todayRun = await prisma.ingestRun.findFirst({
    where: { startedAt: { gte: todayStart } },
    orderBy: { startedAt: "desc" },
  });

  if (!options?.force) {
    if (todayRun?.status === "completed") {
      return {
        runId: todayRun.id,
        reports: [],
        failures: [],
        skipped: true,
        reason: "already_ran_today",
        done: true,
        batchIndex: null,
        totalBatches: parseBatchedSummary(todayRun.summaryJson)?.totalBatches ?? null,
        nextBatchIndex: null,
        status: "completed",
      };
    }

    // Resume a partially finished run instead of skipping or starting over.
    if (todayRun?.status === "running") {
      const summary = parseBatchedSummary(todayRun.summaryJson);
      if (summary && summary.nextBatchIndex < summary.totalBatches) {
        return processIngestBatch(todayRun.id, summary.nextBatchIndex);
      }
      // Corrupt / empty running row — abandon and start fresh below.
      await abandonRun(todayRun.id, "unresumable_running_run");
    }
  } else if (todayRun?.status === "running") {
    // Force refresh abandons today's incomplete run and starts a new one.
    await abandonRun(todayRun.id, "superseded_by_force");
  }

  return startBatchedIngestRun({ force: options?.force });
}

export async function ensureDailyIngest() {
  const result = await runDailyIngest({ force: false });
  return {
    ...result,
    ran: !result.skipped,
  };
}

/** True when the caller should fire another /api/jobs/daily-ingest for the next batch. */
export function needsNextIngestBatch(
  result: Pick<DailyIngestResult, "skipped" | "done" | "nextBatchIndex" | "runId">,
): boolean {
  return (
    !result.skipped &&
    !result.done &&
    result.nextBatchIndex != null &&
    typeof result.runId === "string"
  );
}
