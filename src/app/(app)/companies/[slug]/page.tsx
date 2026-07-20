import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink, ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { endOfLocalDay, startOfLocalDay } from "@/lib/utils";
import { CompanyFeed } from "@/components/company-feed";
import {
  CompanyIntelligenceSummary,
  type IntelligenceSource,
} from "@/components/company-intelligence-summary";
import type { IntelligenceSections } from "@/lib/ai";

export const dynamic = "force-dynamic";

function parseJsonArray(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((id) => typeof id === "string") : [];
  } catch {
    return [];
  }
}

function parseSections(raw: string): IntelligenceSections {
  try {
    const parsed = JSON.parse(raw) as IntelligenceSections;
    return {
      happening: typeof parsed.happening === "string" ? parsed.happening : undefined,
      mattersBecause:
        typeof parsed.mattersBecause === "string" ? parsed.mattersBecause : undefined,
      comparedToPeers:
        typeof parsed.comparedToPeers === "string" ? parsed.comparedToPeers : undefined,
    };
  } catch {
    return {};
  }
}

export default async function CompanyDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const company = await prisma.company.findUnique({ where: { slug } });
  if (!company) notFound();

  const from = startOfLocalDay();
  const to = endOfLocalDay();

  const [updates, intelligenceSummary] = await Promise.all([
    prisma.update.findMany({
      where: {
        companyId: company.id,
        OR: [
          { sourceType: "linkedin", rawSource: { not: null } },
          { sourceType: "website" },
        ],
      },
      include: {
        company: { select: { name: true, slug: true, sector: true } },
      },
      orderBy: { publishedAt: "desc" },
      take: 50,
    }),
    prisma.companyIntelligenceSummary.findUnique({
      where: { companyId: company.id },
    }),
  ]);

  const citedIds = intelligenceSummary
    ? parseJsonArray(intelligenceSummary.citedUpdateIds)
    : [];
  let peerUpdateIds: string[] = [];
  if (intelligenceSummary?.peerContextJson) {
    try {
      const peerContext = JSON.parse(intelligenceSummary.peerContextJson) as {
        peerUpdateIds?: unknown;
      };
      if (Array.isArray(peerContext.peerUpdateIds)) {
        peerUpdateIds = peerContext.peerUpdateIds.filter(
          (id): id is string => typeof id === "string",
        );
      }
    } catch {
      peerUpdateIds = [];
    }
  }
  const allSourceIds = [...new Set([...citedIds, ...peerUpdateIds])];

  const citedUpdates =
    allSourceIds.length > 0
      ? await prisma.update.findMany({
          where: { id: { in: allSourceIds } },
          include: { company: { select: { name: true } } },
          orderBy: { publishedAt: "desc" },
        })
      : [];

  const sources: IntelligenceSource[] = citedUpdates.map((u) => ({
    id: u.id,
    sourceType: u.sourceType as "linkedin" | "website",
    sourceUrl: u.sourceUrl,
    title: u.title,
    excerpt: u.excerpt,
    publishedAt: u.publishedAt,
    companyName: u.company.name,
  }));

  const todayCount = updates.filter((u) => {
    const t = u.publishedAt.getTime();
    return t >= from.getTime() && t <= to.getTime();
  }).length;

  return (
    <div className="px-8 py-8">
      <Link
        href="/portfolio"
        className="inline-flex items-center gap-2 text-sm text-[var(--grey)] hover:text-[var(--black)]"
      >
        <ArrowLeft size={16} /> Portfolio Grid
      </Link>

      <header className="mt-6 border-b border-[var(--border)] pb-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm text-[var(--grey)]">{company.sector}</p>
            <h1 className="font-display mt-1 text-4xl font-bold tracking-tight">
              {company.name}
            </h1>
            <p className="mt-3 max-w-2xl text-[var(--grey)]">{company.description}</p>
            {todayCount > 0 && (
              <p className="mt-3 inline-block bg-[var(--plum)] px-2 py-1 text-xs font-medium text-[var(--white)]">
                {todayCount} update{todayCount === 1 ? "" : "s"} today
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {company.websiteUrl && (
              <a
                href={company.websiteUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 border border-[var(--border-strong)] bg-[var(--bg-secondary)] px-4 py-2 text-sm transition-colors hover:border-[var(--plum)] hover:text-[var(--plum)]"
              >
                Website <ExternalLink size={14} />
              </a>
            )}
            {company.linkedinUrl && (
              <a
                href={company.linkedinUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 bg-[var(--plum)] px-4 py-2 text-sm text-[var(--white)] transition-colors hover:bg-[var(--plum-hover)]"
              >
                LinkedIn page <ExternalLink size={14} />
              </a>
            )}
          </div>
        </div>
        {!company.linkedinUrl && (
          <p className="mt-4 text-sm text-[var(--grey)]">
            No LinkedIn page on file — LinkedIn monitoring is skipped for this company.
            Website news still appears when available.
          </p>
        )}
      </header>

      <section className="mt-8">
        <h2 className="font-display text-2xl font-bold">Intelligence Summary</h2>
        <div className="mt-3">
          <CompanyIntelligenceSummary
            sections={
              intelligenceSummary
                ? parseSections(intelligenceSummary.sectionsJson)
                : {}
            }
            windowDays={intelligenceSummary?.windowDays ?? 30}
            sourceCount={citedIds.length}
            generatedAt={intelligenceSummary?.generatedAt ?? new Date()}
            sources={sources}
          />
        </div>
      </section>

      <section className="mt-10">
        <h2 className="font-display mb-4 text-2xl font-bold">Company Feed</h2>
        <CompanyFeed items={updates} />
      </section>
    </div>
  );
}
