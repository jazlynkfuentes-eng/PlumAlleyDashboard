"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

/**
 * Once per browser tab session, ensure today's automatic ingest has run.
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
        const res = await fetch("/api/jobs/ensure-daily", { method: "POST" });
        if (!res.ok) return;
        const data = await res.json();
        if (typeof sessionStorage !== "undefined") {
          sessionStorage.setItem(key, "1");
        }
        if (data.ran) {
          router.refresh();
        }
      } catch {
        // silent — manual refresh still available
      }
    })();
  }, [router]);

  return null;
}
