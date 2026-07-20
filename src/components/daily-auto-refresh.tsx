"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

/**
 * Once per browser tab session, ensure today's automatic ingest has run,
 * then regenerate intelligence summaries in small batches.
 *
 * Amplify Hosting does not support Next.js `after()`, so this client loop is
 * the reliable continuation mechanism for both ingest batches and summary regen.
 * Manual refresh still available via RefreshButton.
 */
export function DailyAutoRefresh() {
  const router = useRouter();
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    const key = `portfolio-intel:auto-ingest:${new Date().toDateString()}`;
    if (typeof sessionStorage !== "undefined" && sessionStorage.getItem(key)) {
      return;
    }

    void (async () => {
      try {
        let ranAny = false;
        let shouldRegenSummaries = false;
        let summaryForce = false;

        for (;;) {
          const res = await fetch("/api/jobs/ensure-daily", { method: "POST" });
          const text = await res.text();
          if (!res.ok) return;
          if (!text.trim()) {
            // Timed out / empty — retry shortly so a partial run can resume.
            await new Promise((r) => setTimeout(r, 2000));
            continue;
          }
          let data: Record<string, unknown>;
          try {
            data = JSON.parse(text) as Record<string, unknown>;
          } catch {
            return;
          }

          if (data.ran) ranAny = true;
          if (data.done === true && data.summaryRegen && typeof data.summaryRegen === "object") {
            shouldRegenSummaries = true;
            summaryForce =
              (data.summaryRegen as { force?: boolean }).force === true;
          }

          // Finished for today (completed earlier, or this call finished the last batch).
          if (
            data.reason === "already_ran_today" ||
            data.reason === "run_already_finished" ||
            data.done === true ||
            data.nextBatchIndex == null
          ) {
            break;
          }

          // Batch claimed by a concurrent worker — brief pause then resume.
          if (data.skipped && data.reason === "batch_not_ready") {
            await new Promise((r) => setTimeout(r, 1500));
          }
        }

        // Amplify does not support after(), so drive summary regen from the client.
        if (shouldRegenSummaries || ranAny) {
          let summaryOffset = 0;
          for (;;) {
            const res = await fetch("/api/jobs/regenerate-summaries", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${process.env.NEXT_PUBLIC_CRON_SECRET ?? "dev-cron-secret"}`,
              },
              body: JSON.stringify({
                force: summaryForce,
                offset: summaryOffset,
                chain: false,
              }),
            });
            if (!res.ok) break;
            const text = await res.text();
            if (!text.trim()) {
              await new Promise((r) => setTimeout(r, 2000));
              continue;
            }
            let data: Record<string, unknown>;
            try {
              data = JSON.parse(text) as Record<string, unknown>;
            } catch {
              break;
            }
            if (data.done === true || data.nextOffset == null) break;
            summaryOffset = data.nextOffset as number;
          }
        }

        if (typeof sessionStorage !== "undefined") {
          sessionStorage.setItem(key, "1");
        }
        if (ranAny) {
          router.refresh();
        }
      } catch {
        // silent — manual refresh still available
      }
    })();
  }, [router]);

  return null;
}
