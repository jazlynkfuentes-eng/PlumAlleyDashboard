import { prisma } from "@/lib/prisma";
import { CompanyGrid } from "@/components/company-grid";
import { endOfLocalDay, startOfLocalDay } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function PortfolioPage() {
  const from = startOfLocalDay();
  const to = endOfLocalDay();

  const companies = await prisma.company.findMany({
    orderBy: { name: "asc" },
    include: {
      updates: {
        where: {
          OR: [
            { sourceType: "linkedin", rawSource: { not: null } },
            { sourceType: "website" },
          ],
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
    description: c.description,
    logoColor: c.logoColor,
    websiteUrl: c.websiteUrl,
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
        <h1 className="font-display mt-2 text-4xl font-bold tracking-tight">
          {companies.length} Companies
        </h1>
        <p className="mt-2 max-w-2xl text-[var(--grey)]">
          Each card links to the company website. LinkedIn appears only when a
          company page URL is on file.
        </p>
      </header>
      <CompanyGrid companies={cards} />
    </div>
  );
}
