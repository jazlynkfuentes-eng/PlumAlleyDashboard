/**
 * LinkedIn-only refresh (website ingest removed).
 *   npm run ingest:linkedin
 */
import { runDailyIngest } from "../src/lib/ingest";

async function main() {
  const result = await runDailyIngest({ force: true });
  console.log(
    JSON.stringify(
      {
        runId: result.runId,
        skipped: result.skipped,
        failures: result.failures,
        reports: result.reports?.map((r) => ({
          company: r.companySlug,
          linkedin: r.linkedin,
          filtered: r.linkedinFiltered,
          error: r.error,
        })),
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
