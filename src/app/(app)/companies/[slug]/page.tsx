import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink, ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { endOfLocalDay, startOfLocalDay } from "@/lib/utils";
import { UpdateFeed } from "@/components/update-feed";

export const dynamic = "force-dynamic";

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

  const [updates, summary] = await Promise.all([
    prisma.update.findMany({
      where: { companyId: company.id, sourceType: "linkedin", rawSource: { not: null } },
      include: {
        company: { select: { name: true, slug: true, sector: true } },
      },
      orderBy: { publishedAt: "desc" },
      take: 50,
    }),
    company.linkedinUrl
      ? prisma.dailySummary.findUnique({
          where: {
            companyId_summaryDate: {
              companyId: company.id,
              summaryDate: from,
            },
          },
        })
      : Promise.resolve(null),
  ]);

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
            <h1 className="mt-1 text-4xl font-black tracking-tight">{company.name}</h1>
            <p className="mt-3 max-w-2xl text-[var(--grey)]">{company.description}</p>
            {todayCount > 0 && (
              <p className="mt-3 inline-block bg-[var(--black)] px-2 py-1 text-xs font-medium text-[var(--white)]">
                {todayCount} LinkedIn post{todayCount === 1 ? "" : "s"} today
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {company.linkedinUrl && (
              <a
                href={company.linkedinUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 bg-[var(--black)] px-4 py-2 text-sm text-[var(--white)]"
              >
                LinkedIn page <ExternalLink size={14} />
              </a>
            )}
          </div>
        </div>
        {!company.linkedinUrl && (
          <p className="mt-4 text-sm text-[var(--grey)]">
            No LinkedIn page on file — this company is hidden from LinkedIn monitoring.
          </p>
        )}
      </header>

      {!company.linkedinUrl ? (
        <section className="mt-8 border border-[var(--border)] px-5 py-10 text-[var(--grey)]">
          LinkedIn-only mode: no feed for companies without a LinkedIn URL.
        </section>
      ) : (
        <>
          <section className="mt-8">
            <h2 className="text-2xl font-bold">Today&apos;s AI Summary</h2>
            {summary ? (
              <p className="mt-3 max-w-3xl border border-[var(--border)] px-5 py-4 leading-relaxed">
                {summary.content}
              </p>
            ) : (
              <p className="mt-3 text-[var(--grey)]">
                No summary for today yet. Summaries appear after LinkedIn posts are ingested.
              </p>
            )}
          </section>

          <section className="mt-10">
            <h2 className="mb-4 text-2xl font-bold">LinkedIn Feed</h2>
            <UpdateFeed items={updates} showCompany={false} />
          </section>
        </>
      )}
    </div>
  );
}
