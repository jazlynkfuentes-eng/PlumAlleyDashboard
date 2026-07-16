/**
 * Repair LinkedIn Update.publishedAt from raw_source.postedAt when n8n
 * stored workflow/ingest time instead of the real post date.
 */
import { PrismaClient } from "@prisma/client";
import { extractLinkedInPostedAt } from "../src/lib/linkedin-validate";
import { coercePublishedAt } from "../src/lib/utils";

const prisma = new PrismaClient();

async function main() {
  const rows = await prisma.update.findMany({
    where: { sourceType: "linkedin", rawSource: { not: null } },
    select: {
      id: true,
      publishedAt: true,
      publishedAtPrecision: true,
      rawSource: true,
    },
  });

  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of rows) {
    let raw: unknown;
    try {
      raw = JSON.parse(row.rawSource!);
    } catch {
      failed += 1;
      continue;
    }

    const extracted = extractLinkedInPostedAt(raw);
    const coerced = extracted != null ? coercePublishedAt(extracted) : null;
    if (!coerced) {
      skipped += 1;
      continue;
    }

    const deltaMs = Math.abs(coerced.date.getTime() - row.publishedAt.getTime());
    if (deltaMs < 60_000) {
      skipped += 1;
      continue;
    }

    await prisma.update.update({
      where: { id: row.id },
      data: {
        publishedAt: coerced.date,
        publishedAtPrecision: coerced.precision,
        dateVerifyNote: "backfilled from raw_source.postedAt",
        dateVerifiedAt: new Date(),
      },
    });
    updated += 1;
    console.log(
      `fixed ${row.id}: ${row.publishedAt.toISOString()} → ${coerced.date.toISOString()}`,
    );
  }

  console.log(JSON.stringify({ total: rows.length, updated, skipped, failed }));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
