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

function ensureOwnSite(url: string, websiteUrl: string) {
  return sameOrigin(url, websiteUrl);
}

async function fetchText(url: string, accept = "text/html,application/xml") {
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (compatible; PlumAlleyPortfolioIntel/1.0; +https://plumaalley.com)",
      Accept: accept,
    },
    signal: AbortSignal.timeout(20000),
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return { text: await res.text(), finalUrl: res.url, contentType: res.headers.get("content-type") ?? "" };
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
    excerpt: args.excerpt.slice(0, 500),
    content: args.content,
    publishedAt: args.coerced.date,
    publishedAtPrecision: args.coerced.precision,
    dateVerifyNote: args.note,
    externalId: hashId(args.sourceUrl),
  };
}

/** Strategy 1: RSS / Atom (homepage alternates + common paths). */
export async function fetchViaRss(company: Company): Promise<WebsiteFetchResult | null> {
  if (!company.websiteUrl) return null;
  const base = company.websiteUrl.replace(/\/$/, "");
  const candidates = new Set<string>();

  if (company.newsFeedUrl) candidates.add(company.newsFeedUrl);
  for (const path of ["/feed", "/rss", "/rss.xml", "/blog/rss", "/blog/rss.xml", "/atom.xml", "/news/rss", "/news/feed"]) {
    candidates.add(`${base}${path}`);
  }

  try {
    const home = await fetchText(base);
    const $ = cheerio.load(home.text);
    $('link[rel="alternate"]').each((_, el) => {
      const type = ($(el).attr("type") ?? "").toLowerCase();
      const href = $(el).attr("href");
      if (!href) return;
      if (type.includes("rss") || type.includes("atom") || type.includes("xml")) {
        try {
          const abs = new URL(href, base).toString();
          if (ensureOwnSite(abs, company.websiteUrl!)) candidates.add(abs);
        } catch {
          /* skip */
        }
      }
    });
  } catch {
    /* homepage optional */
  }

  for (const feedUrl of candidates) {
    if (!ensureOwnSite(feedUrl, company.websiteUrl)) continue;
    try {
      const feed = await rssParser.parseURL(feedUrl);
      const items: WebsiteFetchItem[] = [];
      for (const item of feed.items ?? []) {
        const link = item.link;
        if (!link || !ensureOwnSite(link, company.websiteUrl)) continue;
        const coerced = coercePublishedAt(item.isoDate ?? item.pubDate ?? item.published);
        if (!coerced) continue;
        const title = item.title ?? null;
        const excerpt = (item.contentSnippet ?? item.content ?? title ?? "").slice(0, 500);
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
      if (items.length > 0) {
        return { strategy: "rss", items: items.slice(0, 20) };
      }
    } catch {
      continue;
    }
  }
  return null;
}

function isNewsLikePath(pathname: string) {
  return /\/(news|blog|press|insights|articles|stories|updates|media)(\/|$)/i.test(pathname);
}

/** Strategy 2: sitemap.xml lastmod for news/blog/press URLs on same origin. */
export async function fetchViaSitemap(company: Company): Promise<WebsiteFetchResult | null> {
  if (!company.websiteUrl) return null;
  const base = company.websiteUrl.replace(/\/$/, "");
  const sitemapUrls = [`${base}/sitemap.xml`, `${base}/sitemap_index.xml`, `${base}/news-sitemap.xml`];

  for (const smUrl of sitemapUrls) {
    try {
      const { text } = await fetchText(smUrl, "application/xml,text/xml");
      const $ = cheerio.load(text, { xmlMode: true });
      const entries: { loc: string; lastmod: string | null }[] = [];

      // sitemap index → nested sitemaps (own origin only)
      const nested: string[] = [];
      $("sitemap > loc").each((_, el) => {
        const loc = $(el).text().trim();
        if (loc && ensureOwnSite(loc, company.websiteUrl!)) nested.push(loc);
      });

      const parseUrlset = (xml: string) => {
        const $$ = cheerio.load(xml, { xmlMode: true });
        $$("url").each((__, el) => {
          const loc = $$(el).find("loc").first().text().trim();
          const lastmod = $$(el).find("lastmod").first().text().trim() || null;
          if (!loc || !ensureOwnSite(loc, company.websiteUrl!)) return;
          try {
            if (!isNewsLikePath(new URL(loc).pathname) && !lastmod) return;
            if (!isNewsLikePath(new URL(loc).pathname)) return;
          } catch {
            return;
          }
          entries.push({ loc, lastmod });
        });
      };

      parseUrlset(text);
      for (const nestedUrl of nested.slice(0, 8)) {
        if (!/news|blog|press|post|article/i.test(nestedUrl) && nested.length > 3) continue;
        try {
          const nestedDoc = await fetchText(nestedUrl, "application/xml,text/xml");
          parseUrlset(nestedDoc.text);
        } catch {
          continue;
        }
      }

      const items: WebsiteFetchItem[] = [];
      for (const entry of entries.slice(0, 25)) {
        if (!entry.lastmod) continue;
        const coerced = coercePublishedAt(entry.lastmod);
        if (!coerced) continue;
        const title = entry.loc.split("/").filter(Boolean).pop()?.replace(/[-_]/g, " ") ?? null;
        items.push(
          toItem({
            sourceUrl: entry.loc,
            title,
            excerpt: title ?? entry.loc,
            content: title ?? entry.loc,
            coerced: { date: coerced.date, precision: coerced.precision === "datetime" ? "date" : coerced.precision },
            note: `sitemap:${smUrl}`,
          }),
        );
      }
      if (items.length > 0) return { strategy: "sitemap", items };
    } catch {
      continue;
    }
  }
  return null;
}

async function extractArticleTime(articleUrl: string, websiteUrl: string) {
  if (!ensureOwnSite(articleUrl, websiteUrl)) return null;
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
    for (const c of candidates) {
      const coerced = coercePublishedAt(c);
      if (coerced) return coerced;
    }
  } catch {
    return null;
  }
  return null;
}

/** Strategy 3: news/blog listing → follow article links for published_time / time datetime. */
export async function fetchViaArticleMeta(company: Company): Promise<WebsiteFetchResult | null> {
  if (!company.websiteUrl) return null;
  const listingUrls = [
    company.newsFeedUrl,
    `${company.websiteUrl.replace(/\/$/, "")}/news`,
    `${company.websiteUrl.replace(/\/$/, "")}/blog`,
    `${company.websiteUrl.replace(/\/$/, "")}/press`,
    company.websiteUrl,
  ].filter(Boolean) as string[];

  for (const listing of listingUrls) {
    if (!ensureOwnSite(listing, company.websiteUrl)) continue;
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
        if (!ensureOwnSite(abs, company.websiteUrl!)) return;
        if (seen.has(abs)) return;
        seen.add(abs);
        links.push({ href: abs, title });
      });

      const items: WebsiteFetchItem[] = [];
      for (const link of links.slice(0, 12)) {
        const coerced = await extractArticleTime(link.href, company.websiteUrl);
        if (!coerced) continue;
        items.push(
          toItem({
            sourceUrl: link.href,
            title: link.title,
            excerpt: link.title,
            content: link.title,
            coerced,
            note: `article_meta:${listing}`,
          }),
        );
      }
      if (items.length > 0) return { strategy: "article_meta", items };
    } catch {
      continue;
    }
  }
  return null;
}

/** Strategy 4: content hash change on news listing / homepage. */
export async function fetchViaContentHash(company: Company): Promise<WebsiteFetchResult | null> {
  if (!company.websiteUrl) return null;
  const target = company.newsFeedUrl || company.websiteUrl;
  if (!ensureOwnSite(target, company.websiteUrl)) return null;

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
 * Pluggable website fetcher — tries strategies in order.
 * Preferred strategy (last success) is tried first, then the rest.
 * Never leaves the company's own website_url origin.
 */
export async function fetchCompanyWebsite(
  ctx: WebsiteFetcherContext,
): Promise<WebsiteFetchResult | null> {
  const { company, preferredStrategy } = ctx;
  if (!company.websiteUrl) return null;

  const order = [
    ...(preferredStrategy ? [preferredStrategy] : []),
    ...STRATEGY_ORDER.filter((s) => s !== preferredStrategy),
  ];

  for (const name of order) {
    try {
      const result = await STRATEGY_FN[name](company);
      if (result && (result.items.length > 0 || name === "content_hash")) {
        // content_hash with empty items = unchanged — still a successful strategy
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
