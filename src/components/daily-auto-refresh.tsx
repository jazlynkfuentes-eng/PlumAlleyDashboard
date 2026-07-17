"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

/**
 * Once per browser tab session, ensure today's automatic ingest has run.
 * Continues calling until all batches finish (or today's run is already complete).
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
