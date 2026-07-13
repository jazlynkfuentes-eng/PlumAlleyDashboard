import { prisma } from "@/lib/prisma";
import { SettingsClient } from "@/components/settings-client";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const [companies, lastRun] = await Promise.all([
    prisma.company.findMany({
      where: { linkedinUrl: { not: null } },
      orderBy: { name: "asc" },
    }),
    prisma.ingestRun.findFirst({ orderBy: { startedAt: "desc" } }),
  ]);

  return (
    <SettingsClient
      companies={companies.map((c) => ({
        id: c.id,
        slug: c.slug,
        name: c.name,
        linkedinUrl: c.linkedinUrl,
        lastFetchedAt: c.lastFetchedAt?.toISOString() ?? null,
        lastError: c.lastError,
      }))}
      lastRun={
        lastRun
          ? {
              id: lastRun.id,
              startedAt: lastRun.startedAt.toISOString(),
              finishedAt: lastRun.finishedAt?.toISOString() ?? null,
              status: lastRun.status,
            }
          : null
      }
    />
  );
}
