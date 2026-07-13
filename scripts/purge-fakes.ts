import { prisma } from "../src/lib/prisma";

async function main() {
  const demoDeleted = await prisma.update.deleteMany({
    where: {
      OR: [{ externalId: { startsWith: "demo-" } }, { rawSource: null }],
    },
  });

  const summariesDeleted = await prisma.dailySummary.deleteMany({
    where: {
      // Seeded summaries had empty citations; also delete summaries for companies that now have zero raw-backed updates
      citedUpdateIds: "[]",
    },
  });

  console.log(
    JSON.stringify(
      {
        deleted_updates: demoDeleted.count,
        deleted_summaries: summariesDeleted.count,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

