/** Normalize a LinkedIn company page URL for exact-ish matching. */
export function normalizeLinkedInCompanyUrl(url: string): string {
  try {
    const u = new URL(url.trim());
    u.hash = "";
    u.search = "";
    let path = u.pathname.replace(/\/+$/, "").toLowerCase();
    // strip trailing /about etc
    path = path.replace(/\/(about|posts|jobs|people|insights)$/i, "");
    return `https://www.linkedin.com${path}`;
  } catch {
    return url.trim().replace(/\/+$/, "").toLowerCase();
  }
}

/**
 * Confirm post author/page is the company page (not a mentions/search hit).
 * Accepts author.linkedinUrl from Apify or company URN-style URLs.
 */
export function authorMatchesCompany(
  authorUrl: string,
  companyLinkedInUrl: string,
): boolean {
  const author = normalizeLinkedInCompanyUrl(authorUrl);
  const company = normalizeLinkedInCompanyUrl(companyLinkedInUrl);

  if (author === company) return true;

  // extract /company/{slug}
  const companySlug = company.match(/\/company\/([^/]+)/i)?.[1];
  const authorSlug = author.match(/\/company\/([^/]+)/i)?.[1];
  if (companySlug && authorSlug && companySlug === authorSlug) return true;

  // Some posts encode vanity in the post URL; author type company with matching universalName
  if (companySlug && author.toLowerCase().includes(`/company/${companySlug}`)) {
    return true;
  }

  return false;
}

export function extractCompanySlugFromLinkedIn(url: string): string | null {
  return normalizeLinkedInCompanyUrl(url).match(/\/company\/([^/]+)/i)?.[1] ?? null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Prefer Apify scraper's postedAt (date / timestamp) over n8n's published_at,
 * which is often the workflow run time rather than the real post date.
 */
export function extractLinkedInPostedAt(rawSource: unknown): string | number | null {
  if (!isRecord(rawSource)) return null;

  const postedAt = rawSource.postedAt;
  if (isRecord(postedAt)) {
    if (typeof postedAt.date === "string" && postedAt.date.trim()) {
      return postedAt.date.trim();
    }
    if (typeof postedAt.timestamp === "number" && Number.isFinite(postedAt.timestamp)) {
      return postedAt.timestamp;
    }
  }

  if (typeof rawSource.publishedAt === "string" && rawSource.publishedAt.trim()) {
    return rawSource.publishedAt.trim();
  }
  if (typeof rawSource.timestamp === "number" && Number.isFinite(rawSource.timestamp)) {
    return rawSource.timestamp;
  }
  if (typeof rawSource.postedDate === "string" && rawSource.postedDate.trim()) {
    return rawSource.postedDate.trim();
  }

  return null;
}

