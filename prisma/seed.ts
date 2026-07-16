// prisma/seed.ts
import { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";

const prisma = new PrismaClient();

function withTrailingSlash(url: string | null | undefined): string | null {
  if (!url || url === "N/A") return null;
  return url.endsWith("/") ? url : `${url}/`;
}

async function main() {
  // Canonical enriched seed (slug, sector, description, tags, logo_color, aliases)
  const seedPath = path.join(__dirname, "..", "data", "company-seed.json");
  const raw = fs.readFileSync(seedPath, "utf-8");
  const companies = JSON.parse(raw) as Array<{
    slug: string;
    name: string;
    sector?: string;
    website_url?: string | null;
    linkedin_url?: string | null;
    news_feed_url?: string | null;
    description?: string;
    tags?: string[];
    logo_color?: string | null;
    aliases?: string[];
  }>;

  let upserted = 0;
  for (const c of companies) {
    const data = {
      name: c.name,
      sector: c.sector ?? "",
      description: c.description ?? "",
      tags: Array.isArray(c.tags) ? c.tags : [],
      logoColor: c.logo_color ?? null,
      aliases: Array.isArray(c.aliases) ? c.aliases : [],
      websiteUrl: withTrailingSlash(c.website_url),
      linkedinUrl: c.linkedin_url ?? null,
      newsFeedUrl: c.news_feed_url ?? null,
    };

    await prisma.company.upsert({
      where: { slug: c.slug },
      create: { slug: c.slug, ...data },
      update: data,
    });
    upserted += 1;
  }

  console.log(`✅ Upserted ${upserted} companies from data/company-seed.json`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
