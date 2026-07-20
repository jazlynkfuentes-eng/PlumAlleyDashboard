import Link from "next/link";
import { ExternalLink, Globe } from "lucide-react";
import { formatRelativeShort } from "@/lib/utils";

function LinkedInGlyph({ size = 14 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
    >
      <path d="M4.98 3.5C4.98 4.88 3.86 6 2.5 6S0 4.88 0 3.5 1.12 1 2.5 1s2.48 1.12 2.48 2.5zM.5 8.5h4V23h-4V8.5zM8.5 8.5h3.8v2h.05c.53-1 1.84-2.05 3.79-2.05 4.05 0 4.8 2.67 4.8 6.15V23h-4v-6.6c0-1.57-.03-3.59-2.19-3.59-2.19 0-2.53 1.71-2.53 3.48V23h-4V8.5z" />
    </svg>
  );
}

export type CompanyCardData = {
  slug: string;
  name: string;
  sector: string;
  description?: string;
  logoColor?: string | null;
  websiteUrl: string | null;
  linkedinUrl: string | null;
  todayCount: number;
  lastUpdated: Date | string | null;
};

/** Per-company badge color from DB seed (hex). Falls back to plum only when unset/invalid. */
function resolveLogoBackground(logoColor?: string | null): string {
  const trimmed = logoColor?.trim();
  if (
    trimmed &&
    /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})$/.test(trimmed)
  ) {
    return trimmed;
  }
  return "var(--plum)";
}

export function CompanyCard({ company }: { company: CompanyCardData }) {
  const initial = company.name.trim().charAt(0).toUpperCase() || "?";
  const logoBg = resolveLogoBackground(company.logoColor);

  return (
    <article className="group flex h-full min-h-0 w-full flex-col rounded-[var(--radius-md)] border border-[var(--border-strong)] bg-[var(--bg-secondary)] p-5 shadow-[var(--shadow-sm)] transition-[transform,box-shadow,background-color] duration-150 hover:-translate-y-px hover:bg-[var(--bg-tertiary)] hover:shadow-[var(--shadow-md)]">
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-1 items-start gap-3">
            <span
              className="flex h-9 w-9 shrink-0 items-center justify-center border border-[var(--border-strong)] text-sm font-bold text-[var(--white)]"
              style={{ backgroundColor: logoBg }}
              aria-hidden
            >
              {initial}
            </span>
            <Link
              href={`/companies/${company.slug}`}
              className="min-w-0 flex-1"
            >
              <h3 className="font-display text-lg font-bold leading-tight group-hover:text-[var(--plum)]">
                {company.name}
              </h3>
              <p className="mt-1 text-sm text-[var(--grey)]">{company.sector}</p>
            </Link>
          </div>
          {company.todayCount > 0 && (
            <span className="shrink-0 bg-[var(--plum)] px-2 py-0.5 text-xs font-medium text-[var(--white)]">
              {company.todayCount} today
            </span>
          )}
        </div>

        {company.description ? (
          <p className="mt-3 text-sm leading-relaxed text-[var(--grey)]">
            {company.description}
          </p>
        ) : null}
      </div>

      <div className="mt-auto flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 pt-5">
        <div className="flex min-w-0 flex-wrap items-center gap-1">
          {company.websiteUrl ? (
            <a
              href={company.websiteUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] px-2 py-1.5 text-xs font-medium text-[var(--grey)] transition-colors hover:bg-[var(--plum-light)] hover:text-[var(--plum)]"
              title="Company website"
            >
              <Globe size={14} strokeWidth={1.75} />
              Website
              <ExternalLink size={12} />
            </a>
          ) : null}
          {company.linkedinUrl ? (
            <a
              href={company.linkedinUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] px-2 py-1.5 text-xs font-medium text-[var(--grey)] transition-colors hover:bg-[var(--plum-light)] hover:text-[var(--plum)]"
              title="LinkedIn page"
            >
              <LinkedInGlyph size={14} />
              LinkedIn
              <ExternalLink size={12} />
            </a>
          ) : null}
        </div>
        <Link
          href={`/companies/${company.slug}`}
          className="basis-full text-xs text-[var(--text-muted)] hover:text-[var(--plum)] sm:basis-auto sm:ml-auto sm:text-right"
        >
          Updated {formatRelativeShort(company.lastUpdated)}
        </Link>
      </div>
    </article>
  );
}

export function CompanyGrid({ companies }: { companies: CompanyCardData[] }) {
  if (companies.length === 0) {
    return (
      <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-secondary)] px-5 py-10 text-[var(--grey)]">
        No companies yet.
      </div>
    );
  }

  return (
    <div className="grid auto-rows-fr grid-cols-1 items-stretch gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {companies.map((c) => (
        <div key={c.slug} className="flex h-full min-h-0 w-full">
          <CompanyCard company={c} />
        </div>
      ))}
    </div>
  );
}
