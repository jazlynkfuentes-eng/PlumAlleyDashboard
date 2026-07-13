// prisma/seed.ts
import { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";

const prisma = new PrismaClient();

async function main() {
  const seedPath = path.join(__dirname, "..", "company-seed.json");
  const raw = fs.readFileSync(seedPath, "utf-8");
  const companies = JSON.parse(raw);

  // Helper to generate slug
  const slugify = (str: string) =>
    str.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

  const data = companies.map((c: any) => ({
    name: c.name,
    slug: slugify(c.name),
    sector: c.sector ?? "",
    websiteUrl: c.website_url ?? null,
    linkedinUrl: c.linkedin_url ?? null,
  }));

  const result = await prisma.company.createMany({
    data,
    skipDuplicates: true,
  });
  console.log(`✅ Seeded ${result.count} companies`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
