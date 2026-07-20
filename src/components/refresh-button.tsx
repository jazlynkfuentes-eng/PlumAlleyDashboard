"use client";

import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { cn } from "@/lib/utils";

async function readJsonResponse(res: Response): Promise<Record<string, unknown>> {
  const text = await res.text();
  if (!text.trim()) {
    throw new Error(
      `Empty response from ingest (${res.status}). The request may have timed out — try Refresh again to resume.`,
    );
  }
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error(
      `Non-JSON response from ingest (${res.status}): ${text.slice(0, 120)}`,
    );
  }
}

const authHeaders = {
  "Content-Type": "application/json",
  Authorization: `Bearer ${process.env.NEXT_PUBLIC_CRON_SECRET ?? "dev-cron-secret"}`,
};

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
      let runId: string | undefined;

      for (;;) {
        const res = await fetch("/api/jobs/daily-ingest", {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify(body),
        });
        const data = await readJsonResponse(res);
        if (!res.ok) {
          throw new Error(
            typeof data.error === "string" ? data.error : "Refresh failed",
          );
        }

        if (typeof data.runId === "string") runId = data.runId;
        total += Array.isArray(data.reports) ? data.reports.length : 0;
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
            runId: data.runId ?? runId,
            batchIndex: data.nextBatchIndex,
            chain: false,
          };
          continue;
        }

        body = {
          runId: data.runId ?? runId,
          batchIndex: data.nextBatchIndex,
          chain: false,
        };
      }

      // Full-portfolio summaries must be regenerated in small HTTP batches —
      // a single after() with 33 LLM calls gets killed by request timeouts.
      setMessage(
        `Ingest done (${total} companies${lastBatchLabel}) · regenerating AI summaries…`,
      );
      let summaryOffset = 0;
      let summaryTotal = 0;
      for (;;) {
        const res = await fetch("/api/jobs/regenerate-summaries", {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({
            force: true,
            offset: summaryOffset,
            chain: false,
          }),
        });
        const data = await readJsonResponse(res);
        if (!res.ok) {
          throw new Error(
            typeof data.error === "string"
              ? data.error
              : "Summary regeneration failed",
          );
        }
        if (typeof data.total === "number") summaryTotal = data.total;
        if (data.done === true || data.nextOffset == null) break;
        summaryOffset = data.nextOffset as number;
        setMessage(
          `Regenerating AI summaries · ${summaryOffset}/${summaryTotal}`,
        );
      }

      setMessage(
        `Updated ${total} companies${lastBatchLabel} · ${summaryTotal} AI summaries · ${new Date().toLocaleTimeString()}`,
      );
      router.refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Refresh failed");
      router.refresh();
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
