"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { UpdateFeed, type FeedItem } from "@/components/update-feed";

type SourceFilter = "all" | "linkedin" | "website";

const FILTERS: { id: SourceFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "linkedin", label: "LinkedIn" },
  { id: "website", label: "Website & News" },
];

/**
 * Company detail feed with All / LinkedIn / Website & News tabs.
 * Distinguishes items via FeedItem.sourceType (same field as the LINKEDIN / Website badge).
 */
export function CompanyFeed({ items }: { items: FeedItem[] }) {
  const [filter, setFilter] = useState<SourceFilter>("all");

  const filtered = useMemo(() => {
    if (filter === "all") return items;
    return items.filter((item) => item.sourceType === filter);
  }, [items, filter]);

  return (
    <div>
      <div
        className="mb-4 flex gap-6 border-b border-[var(--border)]"
        role="tablist"
        aria-label="Filter company feed"
      >
        {FILTERS.map((tab) => {
          const active = filter === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setFilter(tab.id)}
              className={cn(
                "-mb-px border-b-2 pb-2 text-sm transition-colors",
                active
                  ? "border-[var(--black)] font-medium text-[var(--black)]"
                  : "border-transparent text-[var(--grey)] hover:text-[var(--black)]",
              )}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-secondary)] px-5 py-10 text-[var(--grey)] shadow-[var(--shadow-sm)]">
          {items.length === 0
            ? "No updates yet."
            : "No updates for this filter yet."}
        </div>
      ) : (
        <UpdateFeed items={filtered} showCompany={false} />
      )}
    </div>
  );
}
