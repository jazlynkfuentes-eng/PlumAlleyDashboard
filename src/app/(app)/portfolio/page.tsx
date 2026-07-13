import { prisma } from "@/lib/prisma";
import { CompanyGrid } from "@/components/company-grid";
import { endOfLocalDay, startOfLocalDay } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function PortfolioPage() {
  const from = startOfLocalDay();
  const to = endOfLocalDay();

  const companies = await prisma.company.findMany({
    where: { linkedinUrl: { not: null } },
    orderBy: { name: "asc" },
    include: {
      updates: {
        where: {
          sourceType: "linkedin",
          rawSource: { not: null },
          publishedAt: { gte: from, lte: to },
        },
        select: { id: true },
      },
    },
  });

  const cards = companies.map((c) => ({
    slug: c.slug,
    name: c.name,
    sector: c.sector,
    linkedinUrl: c.linkedinUrl,
    todayCount: c.updates.length,
    lastUpdated: c.lastFetchedAt,
  }));

  return (
    <div className="px-8 py-8">
      <header className="mb-8">
        <p className="text-sm uppercase tracking-[0.14em] text-[var(--grey)]">
          Portfolio
        </p>
        <h1 className="mt-2 text-4xl font-black tracking-tight">
          {companies.length} Companies
        </h1>
        <p className="mt-2 max-w-2xl text-[var(--grey)]">
          LinkedIn company-page posts only. Companies without a LinkedIn URL are omitted.
        </p>
      </header>
      <CompanyGrid companies={cards} />
    </div>
  );
}
