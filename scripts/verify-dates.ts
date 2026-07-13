#!/usr/bin/env npx tsx
/**
 * CLI date verification agent — run on this machine:
 *   npm run verify:dates
 *   npm run verify:dates -- --fix
 */
import { verifyUpdateDates } from "../src/lib/date-agent";

async function main() {
  const autoFix = process.argv.includes("--fix");
  console.log(
    autoFix
      ? "Running date agent with --fix …"
      : "Running date agent (report only). Pass --fix to correct. …",
  );
  const result = await verifyUpdateDates({ autoFix, limit: 60 });
  console.log("\nSystem clock:", result.clock);
  console.log("\nSummary:", result.summary);
  console.log("\nFindings:");
  for (const f of result.findings.filter((x) => x.issue !== "ok").slice(0, 30)) {
    console.log(
      `- [${f.issue}] ${f.companyName}: ${f.storedDisplay} → ${f.suggestedPublishedAt ?? "n/a"} | ${f.note}`,
    );
  }
  if (result.findings.every((f) => f.issue === "ok")) {
    console.log("All checked updates look consistent.");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
