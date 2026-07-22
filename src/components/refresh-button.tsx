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
  companySlugs = [],
}: {
  className?: string;
  label?: string;
  /** Static portfolio slugs from the page — no live ingest call to discover the list. */
  companySlugs?: string[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function refresh() {
    setBusy(true);
    setMessage(null);
    try {
      if (companySlugs.length === 0) {
        throw new Error("No companies available to refresh.");
      }

      // One company per request — never kick off the batched { force } path
      // (that starts a run and immediately ingests company #1 in the same HTTP call).
      let total = 0;
      for (let i = 0; i < companySlugs.length; i++) {
        const slug = companySlugs[i]!;
        setMessage(`Ingesting ${i + 1}/${companySlugs.length} · ${slug}`);
        const res = await fetch("/api/jobs/daily-ingest", {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({
            companySlug: slug,
            force: true,
            chain: false,
            skipSummaryRegen: true,
          }),
        });
        const data = await readJsonResponse(res);
        if (!res.ok) {
          throw new Error(
            typeof data.error === "string" ? data.error : "Refresh failed",
          );
        }
        total += Array.isArray(data.reports) ? data.reports.length : 0;
      }

      // Full-portfolio summaries must be regenerated in small HTTP batches —
      // a single after() with 33 LLM calls gets killed by request timeouts.
      setMessage(
        `Ingest done (${total} companies) · regenerating AI summaries…`,
      );
      let summaryOffset = 0;
      let summaryTotal = 0;
      let summaryGenerated = 0;
      let summarySkipped = 0;
      const summaryFailures: string[] = [];
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
        if (typeof data.generated === "number") summaryGenerated += data.generated;
        if (typeof data.skipped === "number") summarySkipped += data.skipped;
        if (Array.isArray(data.failed)) {
          for (const f of data.failed) {
            if (
              f &&
              typeof f === "object" &&
              typeof (f as { name?: unknown }).name === "string" &&
              typeof (f as { error?: unknown }).error === "string"
            ) {
              summaryFailures.push(
                `${(f as { name: string }).name}: ${(f as { error: string }).error}`,
              );
            }
          }
        }
        if (data.done === true || data.nextOffset == null) break;
        summaryOffset = data.nextOffset as number;
        setMessage(
          `Regenerating AI summaries · ${summaryOffset}/${summaryTotal}` +
            (summaryFailures.length
              ? ` · ${summaryFailures.length} failed`
              : ""),
        );
      }

      const failNote = summaryFailures.length
        ? ` · ${summaryFailures.length} failed (${summaryFailures.slice(0, 3).join("; ")}${summaryFailures.length > 3 ? "…" : ""})`
        : "";
      setMessage(
        `Updated ${total} companies · ${summaryGenerated} AI summaries` +
          (summarySkipped ? ` · ${summarySkipped} skipped` : "") +
          failNote +
          ` · ${new Date().toLocaleTimeString()}`,
      );
      if (summaryFailures.length) {
        console.error(
          "[refresh] intelligence summary failures:",
          summaryFailures,
        );
      }
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
