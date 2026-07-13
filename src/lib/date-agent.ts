import * as cheerio from "cheerio";
import Parser from "rss-parser";
import { prisma } from "@/lib/prisma";
import {
  coercePublishedAt,
  formatFeedDate,
  getSystemClock,
  looksLikeDateOnly,
} from "@/lib/utils";

const rssParser = new Parser();

export type DateVerifyFinding = {
  updateId: string;
  companyName: string;
  title: string | null;
  sourceUrl: string;
  storedPublishedAt: string;
  storedDisplay: string;
  storedPrecision: string;
  issue:
    | "ok"
    | "fake_midnight"
    | "future_date"
    | "source_mismatch"
    | "unverifiable";
  suggestedPublishedAt?: string;
  suggestedPrecision?: "datetime" | "date" | "unknown";
  note: string;
};

async function extractDateFromUrl(url: string): Promise<{
  date: Date;
  precision: "datetime" | "date" | "unknown";
  evidence: string;
} | null> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; PlumAlleyDateAgent/1.0; +https://plumaalley.com)",
        Accept: "text/html, application/rss+xml",
      },
      signal: AbortSignal.timeout(15000),
      redirect: "follow",
    });
    if (!res.ok) return null;
    const contentType = res.headers.get("content-type") ?? "";
    const body = await res.text();

    if (contentType.includes("xml") || body.trimStart().startsWith("<?xml")) {
      try {
        const feed = await rssParser.parseString(body);
        const match =
          feed.items?.find((i) => {
            if (!i.link) return false;
            try {
              return url.includes(new URL(i.link).pathname);
            } catch {
              return false;
            }
          }) ?? feed.items?.[0];
        const coerced = coercePublishedAt(match?.isoDate ?? match?.pubDate);
        if (coerced) {
          return { date: coerced.date, precision: coerced.precision, evidence: "rss" };
        }
      } catch {
        // fall through
      }
    }

    const $ = cheerio.load(body);
    const candidates = [
      $('meta[property="article:published_time"]').attr("content"),
      $('meta[name="pubdate"]').attr("content"),
      $('meta[name="publish-date"]').attr("content"),
      $('meta[name="date"]').attr("content"),
      $('meta[property="og:updated_time"]').attr("content"),
      $("time[datetime]").first().attr("datetime"),
      $("time").first().text(),
      $("[itemprop=datePublished]").attr("content") ||
        $("[itemprop=datePublished]").attr("datetime"),
    ];

    for (const c of candidates) {
      const coerced = coercePublishedAt(c);
      if (coerced) {
        return {
          date: coerced.date,
          precision: coerced.precision,
          evidence: `html:${String(c).slice(0, 40)}`,
        };
      }
    }
    return null;
  } catch {
    return null;
  }
}

function noonLocal(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0, 0, 0);
}

/**
 * Date verification agent — runs against this machine's OS clock and source URLs.
 */
export async function verifyUpdateDates(options?: {
  limit?: number;
  autoFix?: boolean;
  companySlug?: string;
}) {
  const clock = getSystemClock();
  const now = new Date();
  const limit = options?.limit ?? 50;

  const updates = await prisma.update.findMany({
    where: {
      sourceType: "linkedin",
      rawSource: { not: null },
      ...(options?.companySlug
        ? { company: { slug: options.companySlug } }
        : undefined),
    },
    include: { company: true },
    orderBy: { publishedAt: "desc" },
    take: limit,
  });

  const findings: DateVerifyFinding[] = [];
  let fixed = 0;

  for (const u of updates) {
    let precision = (u.publishedAtPrecision as "datetime" | "date") || "datetime";
    const finding: DateVerifyFinding = {
      updateId: u.id,
      companyName: u.company.name,
      title: u.title,
      sourceUrl: u.sourceUrl,
      storedPublishedAt: u.publishedAt.toISOString(),
      storedDisplay: formatFeedDate(u.publishedAt, precision),
      storedPrecision: precision,
      issue: "ok",
      note: "OK",
    };

    const isCompanyHub =
      /linkedin\.com\/company\/[^/]+\/?$/i.test(u.sourceUrl) ||
      u.externalId.startsWith("demo-");

    if (looksLikeDateOnly(u.publishedAt) && precision === "datetime") {
      finding.issue = "fake_midnight";
      finding.suggestedPrecision = "date";
      finding.suggestedPublishedAt = noonLocal(u.publishedAt).toISOString();
      finding.note =
        "Time is exactly midnight locally — this was stored as a full datetime and shown as 12:00 AM. Should be date-only.";
    } else if (u.publishedAt.getTime() > now.getTime() + 24 * 60 * 60 * 1000) {
      finding.issue = "future_date";
      finding.note = `Date is in the future vs system clock (${clock.local}).`;
    }

    // Re-check article sources against live page metadata when needed
    if (!isCompanyHub && finding.issue !== "ok") {
      const extracted = await extractDateFromUrl(u.sourceUrl);
      if (extracted) {
        const delta = Math.abs(extracted.date.getTime() - u.publishedAt.getTime());
        if (delta > 12 * 60 * 60 * 1000) {
          finding.issue = "source_mismatch";
          finding.suggestedPublishedAt = extracted.date.toISOString();
          finding.suggestedPrecision = extracted.precision;
          finding.note = `Source (${extracted.evidence}) = ${formatFeedDate(
            extracted.date,
            extracted.precision,
          )}; stored = ${finding.storedDisplay}.`;
        } else if (extracted.precision === "datetime" && finding.issue === "fake_midnight") {
          finding.suggestedPublishedAt = extracted.date.toISOString();
          finding.suggestedPrecision = "datetime";
          finding.note = `Source confirmed time: ${formatFeedDate(extracted.date, "datetime")}.`;
        }
      }
      // When extraction fails, keep the existing issue (fake_midnight / future_date).
    }

    if (options?.autoFix && finding.issue !== "ok") {
      if (finding.issue === "fake_midnight") {
        await prisma.update.update({
          where: { id: u.id },
          data: {
            publishedAt: noonLocal(u.publishedAt),
            publishedAtPrecision: "date",
            dateVerifiedAt: now,
            dateVerifyNote: finding.note,
          },
        });
        fixed += 1;
        finding.note += " Fixed → date-only (no 12:00 AM).";
        precision = "date";
      } else if (finding.suggestedPublishedAt && finding.suggestedPrecision) {
        await prisma.update.update({
          where: { id: u.id },
          data: {
            publishedAt: new Date(finding.suggestedPublishedAt),
            publishedAtPrecision: finding.suggestedPrecision,
            dateVerifiedAt: now,
            dateVerifyNote: finding.note,
          },
        });
        fixed += 1;
        finding.note += " Auto-fixed from source.";
      }
    }

    findings.push(finding);
  }

  // Sweep remaining midnight+datetime rows
  if (options?.autoFix) {
    const leftovers = await prisma.update.findMany({
      where: { publishedAtPrecision: "datetime" },
      select: { id: true, publishedAt: true },
    });
    for (const row of leftovers) {
      if (!looksLikeDateOnly(row.publishedAt)) continue;
      await prisma.update.update({
        where: { id: row.id },
        data: {
          publishedAt: noonLocal(row.publishedAt),
          publishedAtPrecision: "date",
          dateVerifiedAt: now,
          dateVerifyNote: "Bulk fix: midnight placeholder → date precision",
        },
      });
      fixed += 1;
    }
  }

  return {
    clock,
    summary: {
      checked: findings.length,
      issues: findings.filter((f) => f.issue !== "ok").length,
      fixed,
      byIssue: findings.reduce(
        (acc, f) => {
          acc[f.issue] = (acc[f.issue] ?? 0) + 1;
          return acc;
        },
        {} as Record<string, number>,
      ),
    },
    findings,
  };
}
