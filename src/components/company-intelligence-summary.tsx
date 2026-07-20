"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn, formatFeedDate } from "@/lib/utils";
import { SourceBadge } from "@/components/update-feed";
import type { IntelligenceSections } from "@/lib/ai";

export type IntelligenceSource = {
  id: string;
  sourceType: "linkedin" | "website";
  sourceUrl: string;
  title: string | null;
  excerpt: string;
  publishedAt: Date | string;
  companyName: string;
};

const SECTIONS: {
  key: keyof IntelligenceSections;
  heading: string;
}[] = [
  { key: "happening", heading: "Here's what's been happening..." },
  { key: "mattersBecause", heading: "This matters because..." },
  { key: "comparedToPeers", heading: "Compared to peers..." },
];

export function CompanyIntelligenceSummary({
  sections,
  windowDays,
  sourceCount,
  generatedAt,
  sources,
}: {
  sections: IntelligenceSections;
  windowDays: number;
  sourceCount: number;
  generatedAt: Date | string;
  sources: IntelligenceSource[];
}) {
  const [open, setOpen] = useState(false);
  const visible = SECTIONS.filter((s) => sections[s.key]?.trim());

  if (visible.length === 0) {
    return (
      <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-secondary)] px-5 py-4 text-[var(--grey)] shadow-[var(--shadow-sm)]">
        No intelligence summary yet. Summaries are generated after daily ingest
        when LinkedIn or website/news activity is available.
      </div>
    );
  }

  return (
    <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-secondary)] shadow-[var(--shadow-sm)]">
      <div className="space-y-6 px-5 py-5">
        {visible.map(({ key, heading }) => (
          <div key={key}>
            <h3 className="text-sm font-medium text-[var(--plum)]">{heading}</h3>
            <p className="mt-2 leading-relaxed text-[var(--black)]">
              {sections[key]}
            </p>
          </div>
        ))}
      </div>

      <div className="border-t border-[var(--border)] px-5 py-3">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-center justify-between gap-2 text-left text-sm text-[var(--grey)] hover:text-[var(--black)]"
          aria-expanded={open}
        >
          <span>
            Based on {sourceCount} post{sourceCount === 1 ? "" : "s"}/article
            {sourceCount === 1 ? "" : "s"} · last {windowDays} days · generated{" "}
            {formatFeedDate(generatedAt)}
          </span>
          <ChevronDown
            size={16}
            className={cn("shrink-0 transition-transform", open && "rotate-180")}
          />
        </button>

        {open && sources.length > 0 && (
          <ul className="mt-3 space-y-3 border-t border-[var(--border)] pt-3">
            {sources.map((source) => (
              <li key={source.id} className="text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <SourceBadge type={source.sourceType} />
                  <span className="text-[var(--grey)]">
                    {formatFeedDate(source.publishedAt)}
                  </span>
                  {source.companyName && (
                    <span className="text-[var(--grey)]">{source.companyName}</span>
                  )}
                </div>
                <a
                  href={source.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 block font-medium text-[var(--black)] hover:text-[var(--plum)]"
                >
                  {source.title?.trim() || source.excerpt.slice(0, 100)}
                </a>
                <p className="mt-1 line-clamp-2 text-[var(--grey)]">
                  {source.excerpt}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
