import { prisma } from "@/lib/prisma";
import { ingestUpdateRow } from "@/lib/ingest-shared";
import {
  fetchCompanyWebsite,
  type WebsiteStrategyName,
} from "@/lib/website-fetchers";
import type { Company } from "@prisma/client";

const EXCERPT_MAX = 200;

export type WebsiteIngestReport = {
  companySlug: string;
  website: number;
  strategy: WebsiteStrategyName | "none" | null;
  unchanged?: boolean;
  error?: string;
};

/**
 * Run pluggable website fetch strategies and persist Update rows
 * with sourceType "website". Does not touch LinkedIn ingestion.
 */
export async function ingestCompanyWebsite(
  company: Company,
): Promise<WebsiteIngestReport> {
  const report: WebsiteIngestReport = {
    companySlug: company.slug,
    website: 0,
    strategy: null,
  };

  // Prefer homepage; if missing, run the same fetch strategies against newsFeedUrl.
  if (!company.websiteUrl && !company.newsFeedUrl) {
    return report;
  }

  const companyForFetch: Company =
    company.websiteUrl != null
      ? company
      : { ...company, websiteUrl: company.newsFeedUrl };

  const tAll = Date.now();
  console.log(`[ingest:timing] ${company.slug} website start`);

  try {
    const preferredRaw = company.websiteFetchStrategy;
    const preferred =
      preferredRaw === "rss" ||
      preferredRaw === "sitemap" ||
      preferredRaw === "article_meta" ||
      preferredRaw === "content_hash"
        ? preferredRaw
        : null;
    const tFetch = Date.now();
    const result = await fetchCompanyWebsite({
      company: companyForFetch,
      preferredStrategy: preferred,
    });
    console.log(
      `[ingest:timing] ${company.slug} website.fetchCompanyWebsite · ${Date.now() - tFetch}ms · strategy=${result?.strategy ?? "null"} items=${result?.items.length ?? 0}`,
    );

    if (!result) {
      report.strategy = "none";
      const tUp = Date.now();
      await prisma.company.update({
        where: { id: company.id },
        data: {
          websiteFetchStrategy: "none",
          lastFetchedAt: new Date(),
          lastError: null,
        },
      });
      console.log(
        `[ingest:timing] ${company.slug} website.prisma.update(none) · ${Date.now() - tUp}ms · TOTAL=${Date.now() - tAll}ms`,
      );
      return report;
    }

    report.strategy = result.strategy;

    // content_hash with no items = page unchanged
    if (result.strategy === "content_hash" && result.items.length === 0) {
      report.unchanged = true;
      const tUp = Date.now();
      await prisma.company.update({
        where: { id: company.id },
        data: {
          websiteFetchStrategy: result.strategy,
          websiteContentHash: result.contentHash ?? company.websiteContentHash,
          lastFetchedAt: new Date(),
          lastError: null,
        },
      });
      console.log(
        `[ingest:timing] ${company.slug} website.prisma.update(unchanged) · ${Date.now() - tUp}ms · TOTAL=${Date.now() - tAll}ms`,
      );
      return report;
    }

    const tPersist = Date.now();
    for (const item of result.items) {
      const excerpt = (item.excerpt || item.title || item.content || "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, EXCERPT_MAX);

      const row = await ingestUpdateRow({
        companyId: company.id,
        sourceType: "website",
        content: (item.content || excerpt).slice(0, 4000),
        sourceUrl: item.sourceUrl,
        publishedAt: item.publishedAt,
        title: item.title,
        excerpt,
        publishedAtPrecision: item.publishedAtPrecision,
        fetchStrategy: result.strategy,
        externalId: item.externalId,
        dateVerifyNote: item.dateVerifyNote ?? null,
        rawSource: {
          strategy: result.strategy,
          sourceUrl: item.sourceUrl,
          title: item.title,
          publishedAtPrecision: item.publishedAtPrecision,
          dateVerifyNote: item.dateVerifyNote ?? null,
        },
        onDuplicate: "skip",
      });

      if (row.ok && row.inserted) report.website += 1;
    }
    console.log(
      `[ingest:timing] ${company.slug} website.persist · ${Date.now() - tPersist}ms · inserted=${report.website}`,
    );

    const tUp = Date.now();
    await prisma.company.update({
      where: { id: company.id },
      data: {
        websiteFetchStrategy: result.strategy,
        websiteContentHash:
          result.contentHash ?? company.websiteContentHash ?? null,
        lastFetchedAt: new Date(),
        lastError: null,
      },
    });
    console.log(
      `[ingest:timing] ${company.slug} website.prisma.update · ${Date.now() - tUp}ms`,
    );
  } catch (e) {
    report.error = `Website: ${e instanceof Error ? e.message : "failed"}`;
    report.strategy = "none";
    await prisma.company.update({
      where: { id: company.id },
      data: {
        lastError: report.error,
        lastFetchedAt: new Date(),
      },
    });
  }

  console.log(
    `[ingest:timing] ${company.slug} website TOTAL · ${Date.now() - tAll}ms · strategy=${report.strategy} error=${report.error ?? "none"}`,
  );
  return report;
}
