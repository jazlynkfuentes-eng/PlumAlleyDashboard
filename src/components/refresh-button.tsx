"use client";

import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { cn } from "@/lib/utils";

export function RefreshButton({
  className,
  label = "Refresh now",
}: {
  className?: string;
  label?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function refresh() {
    setBusy(true);
    setMessage(null);
    try {
      // chain:false — this button drives batch continuation; don't also after()-trigger.
      let body: Record<string, unknown> = { force: true, chain: false };
      let total = 0;
      let lastBatchLabel = "";

      for (;;) {
        const res = await fetch("/api/jobs/daily-ingest", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${process.env.NEXT_PUBLIC_CRON_SECRET ?? "dev-cron-secret"}`,
          },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Refresh failed");

        total += data.reports?.length ?? 0;
        if (
          typeof data.batchIndex === "number" &&
          typeof data.totalBatches === "number"
        ) {
          lastBatchLabel = ` · batch ${data.batchIndex + 1}/${data.totalBatches}`;
        }

        if (
          data.reason === "already_ran_today" ||
          data.reason === "run_already_finished" ||
          data.done === true ||
          data.nextBatchIndex == null
        ) {
          break;
        }

        if (data.skipped && data.reason === "batch_not_ready") {
          await new Promise((r) => setTimeout(r, 1500));
          body = {
            runId: data.runId,
            batchIndex: data.nextBatchIndex,
            chain: false,
          };
          continue;
        }

        body = {
          runId: data.runId,
          batchIndex: data.nextBatchIndex,
          chain: false,
        };
      }

      setMessage(
        `Updated ${total} companies${lastBatchLabel} · ${new Date().toLocaleTimeString()}`,
      );
      router.refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Refresh failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={cn("flex flex-col items-end gap-1", className)}>
      <button
        type="button"
        onClick={refresh}
        disabled={busy}
        className="inline-flex items-center gap-2 bg-[var(--plum)] px-4 py-2 text-sm text-[var(--white)] transition-colors hover:bg-[var(--plum-hover)] disabled:opacity-50"
      >
        <RefreshCw size={15} className={busy ? "animate-spin" : undefined} />
        {busy ? "Refreshing…" : label}
      </button>
      {message && <p className="max-w-xs text-right text-xs text-[var(--grey)]">{message}</p>}
    </div>
  );
}
