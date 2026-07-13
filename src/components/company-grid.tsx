import Link from "next/link";
import { formatRelativeShort } from "@/lib/utils";

export type CompanyCardData = {
  slug: string;
  name: string;
  sector: string;
  linkedinUrl: string | null;
  todayCount: number;
  lastUpdated: Date | string | null;
};

export function CompanyCard({ company }: { company: CompanyCardData }) {
  return (
    <Link
      href={`/companies/${company.slug}`}
      className="group flex h-full flex-col border border-[var(--border)] bg-[var(--white)] p-5 transition-colors hover:border-[var(--black)]"
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-lg font-bold leading-tight group-hover:underline">
          {company.name}
        </h3>
        {company.todayCount > 0 && (
          <span className="shrink-0 bg-[var(--black)] px-2 py-0.5 text-xs font-medium text-[var(--white)]">
            {company.todayCount} today
          </span>
        )}
      </div>
      <p className="mt-2 text-sm text-[var(--grey)]">{company.sector}</p>
      <div className="mt-auto pt-6 text-xs text-[var(--grey)]">
        {company.linkedinUrl ? "LinkedIn" : "No LinkedIn"}
        <div className="mt-1">Updated {formatRelativeShort(company.lastUpdated)}</div>
      </div>
    </Link>
  );
}

export function CompanyGrid({ companies }: { companies: CompanyCardData[] }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {companies.map((c) => (
        <CompanyCard key={c.slug} company={c} />
      ))}
    </div>
  );
}
