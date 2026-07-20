import { createHash } from "crypto";
import * as cheerio from "cheerio";
import Parser from "rss-parser";
import type { Company } from "@prisma/client";
import { coercePublishedAt, type CoercedPublish } from "@/lib/utils";

const rssParser = new Parser();

export type WebsiteStrategyName =
  | "rss"
  | "sitemap"
  | "article_meta"
  | "content_hash";

export type WebsiteFetchItem = {
  sourceUrl: string;
  title: string | null;
  excerpt: string;
  content: string;
  publishedAt: Date;
  publishedAtPrecision: "datetime" | "date" | "unknown";
  dateVerifyNote?: string;
  externalId: string;
};

export type WebsiteFetchResult = {
  strategy: WebsiteStrategyName;
  items: WebsiteFetchItem[];
  contentHash?: string;
};

export type WebsiteFetcherContext = {
  company: Company;
  /** Prefer previously successful strategy first when set. */
  preferredStrategy?: WebsiteStrategyName | null;
};

function hashId(input: string) {
  return createHash("sha256").update(input).digest("hex").slice(0, 24);
}

function sameOrigin(candidate: string, base: string) {
  try {
    return new URL(candidate).origin === new URL(base).origin;
  } catch {
    return false;
  }
}

/** www-insensitive host compare + same rough registrable domain (a.com / www.a.com). */
function relatedHost(candidate: string, base: string) {
  try {
    const a = new URL(candidate).hostname.toLowerCase().replace(/^www\./, "");
    const b = new URL(base).hostname.toLowerCase().replace(/^www\./, "");
    if (a === b) return true;
    const ra = a.split(".").slice(-2).join(".");
    const rb = b.split(".").slice(-2).join(".");
    return ra === rb && ra.includes(".");
  } catch {
    return false;
  }
}

/**
 * Allow website origin, explicit newsFeedUrl origin, and related hosts
 * (subdomain / www variants of either). Used so seed blog URLs on a sibling
 * host are not skipped.
 */
function isAllowedCompanyUrl(url: string, company: Company) {
  if (!company.websiteUrl) return false;
  if (sameOrigin(url, company.websiteUrl) || relatedHost(url, company.websiteUrl)) {
    return true;
  }
  if (company.newsFeedUrl) {
    if (sameOrigin(url, company.newsFeedUrl) || relatedHost(url, company.newsFeedUrl)) {
      return true;
    }
  }
  return false;
}

function normalizeUrlKey(url: string) {
  try {
    const u = new URL(url);
    u.hash = "";
    let path = u.pathname.replace(/\/+$/, "") || "/";
    return `${u.origin.toLowerCase()}${path.toLowerCase()}`;
  } catch {
    return url.replace(/\/+$/, "").toLowerCase();
  }
}

function mergeItems(batches: WebsiteFetchItem[][], limit = 40): WebsiteFetchItem[] {
  const seen = new Set<string>();
  const out: WebsiteFetchItem[] = [];
  for (const batch of batches) {
    for (const item of batch) {
      const key = normalizeUrlKey(item.sourceUrl);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(item);
    }
  }
  return out
    .sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime())
    .slice(0, limit);
}

function originBase(url: string) {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

async function fetchText(url: string, accept = "text/html,application/xml") {
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (compatible; PlumAlleyPortfolioIntel/1.0; +https://plumaalley.com)",
      Accept: accept,
    },
    signal: AbortSignal.timeout(10000),
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return {
    text: await res.text(),
    finalUrl: res.url,
    contentType: res.headers.get("content-type") ?? "",
  };
}

function toItem(args: {
  sourceUrl: string;
  title: string | null;
  excerpt: string;
  content: string;
  coerced: CoercedPublish;
  note?: string;
}): WebsiteFetchItem {
  return {
    sourceUrl: args.sourceUrl,
    title: args.title,
    excerpt: args.excerpt.slice(0, 200),
    content: args.content,
    publishedAt: args.coerced.date,
    publishedAtPrecision: args.coerced.precision,
    dateVerifyNote: args.note,
    externalId: hashId(args.sourceUrl),
  };
}

/** Strategy 1: RSS / Atom — try all candidates (news + blog) and merge. */
export async function fetchViaRss(
  company: Company,
): Promise<WebsiteFetchResult | null> {
  if (!company.websiteUrl) return null;
  const siteBase = company.websiteUrl.replace(/\/$/, "");
  const candidates = new Set<string>();

  if (company.newsFeedUrl) candidates.add(company.newsFeedUrl);

  const bases = new Set<string>([siteBase]);
  if (company.newsFeedUrl) {
    const o = originBase(company.newsFeedUrl);
    if (o) bases.add(o);
  }

  const feedPaths = [
    "/feed",
    "/rss",
    "/rss.xml",
    "/blog/rss",
    "/blog/rss.xml",
    "/blog/feed",
    "/atom.xml",
    "/news/rss",
    "/news/feed",
    "/journal/rss",
    "/journal/feed",
  ];
  for (const base of bases) {
    for (const path of feedPaths) {
      candidates.add(`${base.replace(/\/$/, "")}${path}`);
    }
  }

  try {
    const home = await fetchText(siteBase);
    const $ = cheerio.load(home.text);
    $('link[rel="alternate"]').each((_, el) => {
      const type = ($(el).attr("type") ?? "").toLowerCase();
      const href = $(el).attr("href");
      if (!href) return;
      if (type.includes("rss") || type.includes("atom") || type.includes("xml")) {
        try {
          const abs = new URL(href, siteBase).toString();
          if (isAllowedCompanyUrl(abs, company)) candidates.add(abs);
        } catch {
          /* skip */
        }
      }
    });
  } catch {
    /* homepage optional */
  }

  const batches: WebsiteFetchItem[][] = [];

  for (const feedUrl of candidates) {
    if (!isAllowedCompanyUrl(feedUrl, company)) continue;
    try {
      const feed = await rssParser.parseURL(feedUrl);
      const items: WebsiteFetchItem[] = [];
      for (const item of feed.items ?? []) {
        const link = item.link;
        if (!link || !isAllowedCompanyUrl(link, company)) continue;
        const coerced = coercePublishedAt(
          item.isoDate ?? item.pubDate ?? item.published,
        );
        if (!coerced) continue;
        const title = item.title ?? null;
        const excerpt = (item.contentSnippet ?? item.content ?? title ?? "").slice(
          0,
          200,
        );
        items.push(
          toItem({
            sourceUrl: link,
            title,
            excerpt,
            content: item.content ?? excerpt,
            coerced,
            note: `rss:${feedUrl}`,
          }),
        );
      }
      if (items.length > 0) batches.push(items);
    } catch {
      continue;
    }
  }

  const merged = mergeItems(batches, 40);
  if (merged.length === 0) return null;
  return { strategy: "rss", items: merged };
}

function isNewsLikePath(pathname: string) {
  return /\/(news|blog|press|insights|articles|stories|updates|media|journal|resources|posts|announcements|bulletin)(\/|$)/i.test(
    pathname,
  );
}

/** Strategy 2: sitemap.xml lastmod for news/blog/press URLs. */
export async function fetchViaSitemap(
  company: Company,
): Promise<WebsiteFetchResult | null> {
  if (!company.websiteUrl) return null;
  const bases = new Set<string>([company.websiteUrl.replace(/\/$/, "")]);
  if (company.newsFeedUrl) {
    const o = originBase(company.newsFeedUrl);
    if (o) bases.add(o);
  }

  const sitemapUrls = new Set<string>();
  for (const base of bases) {
    sitemapUrls.add(`${base}/sitemap.xml`);
    sitemapUrls.add(`${base}/sitemap_index.xml`);
    sitemapUrls.add(`${base}/news-sitemap.xml`);
  }

  for (const smUrl of sitemapUrls) {
    if (!isAllowedCompanyUrl(smUrl, company)) continue;
    try {
      const { text } = await fetchText(smUrl, "application/xml,text/xml");
      const $ = cheerio.load(text, { xmlMode: true });
      const entries: { loc: string; lastmod: string | null }[] = [];

      const nested: string[] = [];
      $("sitemap > loc").each((_, el) => {
        const loc = $(el).text().trim();
        if (loc && isAllowedCompanyUrl(loc, company)) nested.push(loc);
      });

      const parseUrlset = (xml: string) => {
        const $$ = cheerio.load(xml, { xmlMode: true });
        $$("url").each((__, el) => {
          const loc = $$(el).find("loc").first().text().trim();
          const lastmod = $$(el).find("lastmod").first().text().trim() || null;
          if (!loc || !isAllowedCompanyUrl(loc, company)) return;
          try {
            if (!isNewsLikePath(new URL(loc).pathname)) return;
          } catch {
            return;
          }
          entries.push({ loc, lastmod });
        });
      };

      parseUrlset(text);
      for (const nestedUrl of nested.slice(0, 8)) {
        if (
          !/news|blog|press|post|article|journal|stories|resources/i.test(
            nestedUrl,
          ) &&
          nested.length > 3
        ) {
          continue;
        }
        try {
          const nestedDoc = await fetchText(nestedUrl, "application/xml,text/xml");
          parseUrlset(nestedDoc.text);
        } catch {
          continue;
        }
      }

      const items: WebsiteFetchItem[] = [];
      for (const entry of entries.slice(0, 40)) {
        if (!entry.lastmod) continue;
        const coerced = coercePublishedAt(entry.lastmod);
        if (!coerced) continue;
        const title =
          entry.loc.split("/").filter(Boolean).pop()?.replace(/[-_]/g, " ") ??
          null;
        items.push(
          toItem({
            sourceUrl: entry.loc,
            title,
            excerpt: title ?? entry.loc,
            content: title ?? entry.loc,
            coerced: {
              date: coerced.date,
              precision:
                coerced.precision === "datetime" ? "date" : coerced.precision,
            },
            note: `sitemap:${smUrl}`,
          }),
        );
      }
      if (items.length > 0) {
        return { strategy: "sitemap", items: mergeItems([items], 40) };
      }
    } catch {
      continue;
    }
  }
  return null;
}

async function extractArticleTime(articleUrl: string, company: Company) {
  if (!isAllowedCompanyUrl(articleUrl, company)) return null;
  try {
    const { text } = await fetchText(articleUrl);
    const $ = cheerio.load(text);
    const candidates = [
      $('meta[property="article:published_time"]').attr("content"),
      $('meta[name="pubdate"]').attr("content"),
      $('meta[name="publish-date"]').attr("content"),
      $('meta[name="date"]').attr("content"),
      $("time[datetime]").first().attr("datetime"),
      $("[itemprop=datePublished]").attr("content") ||
        $("[itemprop=datePublished]").attr("datetime"),
    ];
    let coerced = null as ReturnType<typeof coercePublishedAt>;
    for (const c of candidates) {
      coerced = coercePublishedAt(c);
      if (coerced) break;
    }
    if (!coerced) return null;

    const excerpt =
      $('meta[property="og:description"]').attr("content") ||
      $('meta[name="description"]').attr("content") ||
      $("article p, .post p, main p")
        .first()
        .text()
        .replace(/\s+/g, " ")
        .trim() ||
      "";

    return { coerced, excerpt: excerpt.slice(0, 200) };
  } catch {
    return null;
  }
}

function listingCandidates(company: Company): string[] {
  const urls = new Set<string>();
  if (company.newsFeedUrl) urls.add(company.newsFeedUrl);

  const bases = new Set<string>();
  if (company.websiteUrl) bases.add(company.websiteUrl.replace(/\/$/, ""));
  if (company.newsFeedUrl) {
    const o = originBase(company.newsFeedUrl);
    if (o) bases.add(o);
  }

  const paths = ["/news", "/blog", "/press", "/journal", "/stories", "/resources"];
  for (const base of bases) {
    for (const path of paths) {
      urls.add(`${base}${path}`);
    }
  }
  if (company.websiteUrl) urls.add(company.websiteUrl);

  return [...urls];
}

/** Strategy 3: scrape all news/blog listings and merge article links. */
export async function fetchViaArticleMeta(
  company: Company,
): Promise<WebsiteFetchResult | null> {
  if (!company.websiteUrl) return null;

  const batches: WebsiteFetchItem[][] = [];

  for (const listing of listingCandidates(company)) {
    if (!isAllowedCompanyUrl(listing, company)) continue;
    try {
      const { text } = await fetchText(listing);
      const $ = cheerio.load(text);
      const links: { href: string; title: string }[] = [];
      const seen = new Set<string>();

      $("article a, .post a, .news-item a, a").each((_, el) => {
        if (links.length >= 15) return;
        const href = $(el).attr("href");
        const title = $(el).text().replace(/\s+/g, " ").trim();
        if (!href || title.length < 18 || title.length > 200) return;
        let abs: string;
        try {
          abs = new URL(href, listing).toString();
        } catch {
          return;
        }
        if (!isAllowedCompanyUrl(abs, company)) return;
        const key = normalizeUrlKey(abs);
        if (seen.has(key)) return;
        seen.add(key);
        links.push({ href: abs, title });
      });

      const items: WebsiteFetchItem[] = [];
      for (const link of links.slice(0, 12)) {
        const extracted = await extractArticleTime(link.href, company);
        if (!extracted) continue;
        items.push(
          toItem({
            sourceUrl: link.href,
            title: link.title,
            excerpt: extracted.excerpt || link.title,
            content: extracted.excerpt || link.title,
            coerced: extracted.coerced,
            note: `article_meta:${listing}`,
          }),
        );
      }
      if (items.length > 0) batches.push(items);
    } catch {
      continue;
    }
  }

  const merged = mergeItems(batches, 40);
  if (merged.length === 0) return null;
  return { strategy: "article_meta", items: merged };
}

/** Strategy 4: content hash change on news listing / homepage. */
export async function fetchViaContentHash(
  company: Company,
): Promise<WebsiteFetchResult | null> {
  if (!company.websiteUrl) return null;
  const target = company.newsFeedUrl || company.websiteUrl;
  if (!isAllowedCompanyUrl(target, company)) return null;

  try {
    const { text } = await fetchText(target);
    const $ = cheerio.load(text);
    $("script, style, noscript").remove();
    const normalized = $("body").text().replace(/\s+/g, " ").trim().slice(0, 50000);
    const contentHash = createHash("sha256").update(normalized).digest("hex");

    if (company.websiteContentHash && company.websiteContentHash === contentHash) {
      return { strategy: "content_hash", items: [], contentHash };
    }

    const now = new Date();
    const item: WebsiteFetchItem = {
      sourceUrl: target,
      title: `${company.name} website change detected`,
      excerpt: "Page content changed since last fetch; exact publish time unknown.",
      content: normalized.slice(0, 2000),
      publishedAt: now,
      publishedAtPrecision: "unknown",
      dateVerifyNote: "unknown — detected via change",
      externalId: hashId(`${target}:${contentHash}`),
    };

    return { strategy: "content_hash", items: [item], contentHash };
  } catch {
    return null;
  }
}

const STRATEGY_ORDER: WebsiteStrategyName[] = [
  "rss",
  "sitemap",
  "article_meta",
  "content_hash",
];

const STRATEGY_FN: Record<
  WebsiteStrategyName,
  (company: Company) => Promise<WebsiteFetchResult | null>
> = {
  rss: fetchViaRss,
  sitemap: fetchViaSitemap,
  article_meta: fetchViaArticleMeta,
  content_hash: fetchViaContentHash,
};

/**
 * Pluggable website fetcher — tries strategies in fixed priority order:
 * rss → sitemap → article_meta → content_hash (last-resort page-change only).
 *
 * Within rss / article_meta, multiple listings (news + blog, website +
 * newsFeed hosts) are merged and deduped by URL — we do not stop at the
 * first successful listing.
 *
 * Preferred strategy (last success) may be tried first ONLY if it is an
 * article-producing strategy. content_hash is never preferred.
 */
export async function fetchCompanyWebsite(
  ctx: WebsiteFetcherContext,
): Promise<WebsiteFetchResult | null> {
  const { company, preferredStrategy } = ctx;
  if (!company.websiteUrl) return null;

  const articleStrategies: WebsiteStrategyName[] = [
    "rss",
    "sitemap",
    "article_meta",
  ];
  const preferArticle =
    preferredStrategy && articleStrategies.includes(preferredStrategy)
      ? preferredStrategy
      : null;

  const order: WebsiteStrategyName[] = [
    ...(preferArticle ? [preferArticle] : []),
    ...articleStrategies.filter((s) => s !== preferArticle),
    "content_hash",
  ];

  for (const name of order) {
    try {
      const result = await STRATEGY_FN[name](company);
      if (result && (result.items.length > 0 || name === "content_hash")) {
        if (name === "content_hash" && result.items.length === 0) {
          return result;
        }
        if (result.items.length > 0) return result;
      }
    } catch {
      continue;
    }
  }
  return null;
}

export { STRATEGY_ORDER, STRATEGY_FN };
