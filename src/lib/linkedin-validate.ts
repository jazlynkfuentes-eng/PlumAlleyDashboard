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
