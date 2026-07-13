// prisma/seed.ts
import { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";

const prisma = new PrismaClient();

async function main() {
  const seedPath = path.join(__dirname, "..", "company-seed.json");
  const raw = fs.readFileSync(seedPath, "utf-8");
  const companies = JSON.parse(raw);

  // Map JSON fields to Prisma model fields with slug generation
  const slugify = (str:string)=>str.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'');
  const data = companies.map((c:any)=>({
    name: c.name,
    slug: slugify(c.name),
    sector: c.sector ?? "",
    websiteUrl: c.website_url ?? null,
    linkedinUrl: c.linkedin_url ?? null,
  }));

  // Use createMany with skipDuplicates (based on unique slug or name if made unique later)
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

