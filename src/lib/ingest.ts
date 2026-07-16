import { ApifyClient } from "apify-client";
import { createHash } from "crypto";
import { prisma } from "@/lib/prisma";
import { generateCompanySummary } from "@/lib/ai";
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

export async function runDailyIngest(options?: {
  companySlug?: string;
  force?: boolean;
}) {
  const todayStart = startOfLocalDay();

  if (!options?.force && !options?.companySlug) {
    const already = await prisma.ingestRun.findFirst({
      where: {
        status: "completed",
        startedAt: { gte: todayStart },
      },
      orderBy: { startedAt: "desc" },
    });
    if (already) {
      return {
        runId: already.id,
        reports: [] as IngestReport[],
        skipped: true as const,
        reason: "already_ran_today" as const,
        failures: [] as string[],
      };
    }
  }

  const run = await prisma.ingestRun.create({
    data: { status: "running" },
  });

  const companies = await prisma.company.findMany({
    where: {
      OR: [
        { linkedinUrl: { not: null } },
        { websiteUrl: { not: null } },
        { newsFeedUrl: { not: null } },
      ],
      ...(options?.companySlug ? { slug: options.companySlug } : {}),
    },
    orderBy: { name: "asc" },
  });

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

  const failures = reports.filter((r) => r.error).map((r) => `${r.companySlug}: ${r.error}`);

  await prisma.ingestRun.update({
    where: { id: run.id },
    data: {
      status: "completed",
      finishedAt: new Date(),
      summaryJson: JSON.stringify({
        count: reports.length,
        failureCount: failures.length,
        failures,
        reports,
      }),
    },
  });

  return {
    runId: run.id,
    reports,
    failures,
    skipped: false as const,
  };
}

export async function ensureDailyIngest() {
  const result = await runDailyIngest({ force: false });
  return {
    ...result,
    ran: !result.skipped,
  };
}
