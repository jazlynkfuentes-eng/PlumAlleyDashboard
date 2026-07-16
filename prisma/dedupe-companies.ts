/**
 * One-shot: remove Company rows whose slug is not in data/company-seed.json.
 * Reassigns updates/summaries to the canonical seed slug when possible.
 */
import { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";

const prisma = new PrismaClient();

async function main() {
  const seed = JSON.parse(
    fs.readFileSync(path.join(__dirname, "..", "data", "company-seed.json"), "utf8"),
  ) as Array<{ slug: string; name: string }>;
  const keepSlugs = new Set(seed.map((c) => c.slug));

  const companies = await prisma.company.findMany({
    select: { id: true, slug: true, name: true },
  });

  const extras = companies.filter((c) => !keepSlugs.has(c.slug));
  console.log("before_count=" + companies.length);
  console.log("extras=" + extras.length);

  // Heuristic: map extra slug → keep slug by normalized name prefix
  const keepBySlug = new Map(companies.filter((c) => keepSlugs.has(c.slug)).map((c) => [c.slug, c]));

  function findCanonical(extra: { slug: string; name: string }) {
    // Direct known aliases from old root seed slugify
    const alias: Record<string, string> = {
      "grey-rhino-formerly-one-concern": "grey-rhino",
      humans: "humans-and",
      "mai-formerly-markable": "mai",
      "one-health-dba-fidocure": "fidocure",
      "programmable-medicine-llc": "programmable-medicine",
      "siren-biotechnologies": "siren-biotechnology",
      "vyv-formerly-vital-vio": "vyv",
    };
    if (alias[extra.slug] && keepBySlug.has(alias[extra.slug])) {
      return keepBySlug.get(alias[extra.slug])!;
    }
    return null;
  }

  for (const extra of extras) {
    const canonical = findCanonical(extra);
    console.log(
      "DELETE",
      extra.slug,
      "|",
      extra.name,
      "→ merge into",
      canonical?.slug ?? "(none)",
    );

    if (canonical) {
      const updates = await prisma.update.findMany({ where: { companyId: extra.id } });
      for (const u of updates) {
        const clash = await prisma.update.findFirst({
          where: {
            companyId: canonical.id,
            OR: [
              { sourceUrl: u.sourceUrl },
              {
                sourceType: u.sourceType,
                externalId: u.externalId,
              },
            ],
          },
        });
        if (clash) {
          await prisma.update.delete({ where: { id: u.id } });
        } else {
          await prisma.update.update({
            where: { id: u.id },
            data: { companyId: canonical.id },
          });
        }
      }

      const summaries = await prisma.dailySummary.findMany({
        where: { companyId: extra.id },
      });
      for (const s of summaries) {
        const clash = await prisma.dailySummary.findUnique({
          where: {
            companyId_summaryDate: {
              companyId: canonical.id,
              summaryDate: s.summaryDate,
            },
          },
        });
        if (clash) {
          await prisma.dailySummary.delete({ where: { id: s.id } });
        } else {
          await prisma.dailySummary.update({
            where: { id: s.id },
            data: { companyId: canonical.id },
          });
        }
      }
    }

    await prisma.company.delete({ where: { id: extra.id } });
  }

  const after = await prisma.company.count();
  console.log("after_count=" + after);
  const remaining = await prisma.company.findMany({
    orderBy: { name: "asc" },
    select: { name: true, slug: true },
  });
  for (const c of remaining) console.log(c.name + " | " + c.slug);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
