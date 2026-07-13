import { prisma } from "../src/lib/prisma";
import { ingestUpdateRow } from "../src/lib/ingest-shared";

async function main() {
  const companies = await prisma.company.count();
  console.log("company count:", companies);

  const result = await ingestUpdateRow({
    companyName: "einride",
    sourceType: "linkedin",
    content: "debug post",
    sourceUrl: `https://www.linkedin.com/feed/update/debug-${Date.now()}`,
    publishedAt: new Date().toISOString(),
    rawSource: { id: "debug", content: "debug post", linkedinUrl: "x" },
    onDuplicate: "skip",
  });
  console.log(JSON.stringify(result, null, 2));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
