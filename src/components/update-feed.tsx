import Link from "next/link";
import { ExternalLink, Globe } from "lucide-react";
import { cn, formatFeedDate } from "@/lib/utils";

export type FeedItem = {
  id: string;
  sourceType: "linkedin" | "website";
  sourceUrl: string;
  title: string | null;
  excerpt: string;
  publishedAt: Date | string;
  publishedAtPrecision?: string | null;
  company: {
    name: string;
    slug: string;
    sector: string;
  };
};

function LinkedInGlyph({ size = 12 }: { size?: number }) {
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

export function SourceBadge({ type }: { type: "linkedin" | "website" }) {
  const isLinkedIn = type === "linkedin";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] border px-2 py-0.5 text-xs uppercase tracking-wide",
        isLinkedIn
          ? "border-[var(--plum)]/30 bg-[var(--plum-light)] text-[var(--plum)]"
          : "border-[var(--border-strong)] bg-[var(--bg-tertiary)] text-[var(--grey)]",
      )}
    >
      {isLinkedIn ? <LinkedInGlyph size={12} /> : <Globe size={12} />}
      {isLinkedIn ? "LinkedIn" : "Website"}
    </span>
  );
}

export function UpdateFeed({
  items,
  showCompany = true,
}: {
  items: FeedItem[];
  showCompany?: boolean;
}) {
  if (items.length === 0) {
    return (
      <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-secondary)] px-5 py-10 text-[var(--grey)] shadow-[var(--shadow-sm)]">
        No updates yet.
      </div>
    );
  }

  return (
    <ol className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-secondary)] shadow-[var(--shadow-sm)]">
      {items.map((item) => (
        <li
          key={item.id}
          className="border-b border-[var(--border)] px-5 py-5 transition-colors last:border-b-0 hover:bg-[var(--bg-tertiary)]/60"
        >
          <div className="flex flex-wrap items-center gap-2 text-sm text-[var(--grey)]">
            {showCompany && (
              <Link
                href={`/companies/${item.company.slug}`}
                className="rounded-sm bg-[var(--muted-bg)] px-2 py-0.5 font-medium text-[var(--black)] hover:underline"
              >
                {item.company.name}
              </Link>
            )}
            <SourceBadge type={item.sourceType} />
            <time dateTime={new Date(item.publishedAt).toISOString()}>
              {formatFeedDate(item.publishedAt, item.publishedAtPrecision)}
            </time>
          </div>
          {item.title && (
            <h3 className="mt-2 text-lg font-bold leading-snug">{item.title}</h3>
          )}
          <p className={cn("mt-1 text-[var(--grey)]", !item.title && "mt-2 text-[var(--black)]")}>
            {item.excerpt}
          </p>
          <a
            href={item.sourceUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-[var(--plum)] underline underline-offset-4 hover:text-[var(--plum-hover)]"
          >
            View original <ExternalLink size={14} />
          </a>
        </li>
      ))}
    </ol>
  );
}
