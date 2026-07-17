"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { formatRelativeShort } from "@/lib/utils";

type CompanyRow = {
  id: string;
  slug: string;
  name: string;
  linkedinUrl: string | null;
  lastFetchedAt: string | null;
  lastError: string | null;
};

type IngestRun = {
  id: string;
  startedAt: string;
  finishedAt: string | null;
  status: string;
};

export function SettingsClient({
  companies,
  lastRun,
}: {
  companies: CompanyRow[];
  lastRun: IngestRun | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [rows, setRows] = useState(companies);

  async function verifyDates(autoFix: boolean) {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/jobs/verify-dates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ autoFix, limit: 60, sourceType: "linkedin" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Date verify failed");
      setMessage(
        `Date agent · clock ${data.clock?.local ?? ""} · checked ${data.summary?.checked ?? 0}, issues ${data.summary?.issues ?? 0}, fixed ${data.summary?.fixed ?? 0}`,
      );
      router.refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Date verify failed");
    } finally {
      setBusy(false);
    }
  }

  async function runIngest(slug?: string) {
    setBusy(true);
    setMessage(null);
    try {
      let body: Record<string, unknown> = slug
        ? { companySlug: slug, force: true, chain: false }
        : { force: true, chain: false };
      let total = 0;

      for (;;) {
        const res = await fetch("/api/jobs/daily-ingest", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${process.env.NEXT_PUBLIC_CRON_SECRET ?? "dev-cron-secret"}`,
          },
          body: JSON.stringify(body),
        });
        const text = await res.text();
        if (!text.trim()) {
          throw new Error(
            `Empty response from ingest (${res.status}). Request may have timed out — try again to resume.`,
          );
        }
        let data: Record<string, unknown>;
        try {
          data = JSON.parse(text) as Record<string, unknown>;
        } catch {
          throw new Error(`Non-JSON response from ingest (${res.status})`);
        }
        if (!res.ok) {
          throw new Error(
            typeof data.error === "string" ? data.error : "Ingest failed",
          );
        }
        total += Array.isArray(data.reports) ? data.reports.length : 0;

        if (slug || data.done === true || data.nextBatchIndex == null) break;
        if (data.skipped && data.reason === "batch_not_ready") {
          await new Promise((r) => setTimeout(r, 1500));
        }
        body = {
          runId: data.runId,
          batchIndex: data.nextBatchIndex,
          chain: false,
        };
      }

      setMessage(
        `Ingest ran for ${total} compan${total === 1 ? "y" : "ies"}. Prefer the n8n workflow for production LinkedIn pulls.`,
      );
      router.refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Ingest failed");
    } finally {
      setBusy(false);
    }
  }

  async function saveCompany(e: FormEvent<HTMLFormElement>, id: string) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/companies/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          linkedinUrl: String(form.get("linkedinUrl") || "") || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed");
      setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...data.company } : r)));
      setMessage(`Saved ${data.company.name}`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="px-8 py-8">
      <header className="mb-8">
        <p className="text-sm uppercase tracking-[0.14em] text-[var(--grey)]">Settings</p>
        <h1 className="mt-2 text-4xl font-black tracking-tight">LinkedIn Sources</h1>
        <p className="mt-2 max-w-2xl text-[var(--grey)]">
          This dashboard only shows official LinkedIn company-page posts. Prefer the fixed n8n
          workflow for daily pulls; optional in-app Apify uses <code>APIFY_TOKEN</code>.
        </p>
      </header>

      <section className="mb-10 border border-[var(--border)] p-5">
        <h2 className="text-xl font-bold">LinkedIn refresh</h2>
        <p className="mt-2 text-sm text-[var(--grey)]">
          Primary path: n8n → <code>POST /api/updates/linkedin</code>. Optional: run Apify
          from here when <code>APIFY_TOKEN</code> is set (and <code>LINKEDIN_VIA_APP</code> is
          not <code>0</code>).
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={busy}
            onClick={() => runIngest()}
            className="bg-[var(--black)] px-4 py-2 text-sm text-[var(--white)] disabled:opacity-50"
          >
            {busy ? "Running…" : "Refresh LinkedIn now"}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => verifyDates(false)}
            className="border border-[var(--border-strong)] px-4 py-2 text-sm hover:bg-[var(--muted-bg)] disabled:opacity-50"
          >
            Verify dates
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => verifyDates(true)}
            className="border border-[var(--border-strong)] px-4 py-2 text-sm hover:bg-[var(--muted-bg)] disabled:opacity-50"
          >
            Verify &amp; fix dates
          </button>
          {lastRun && (
            <span className="text-sm text-[var(--grey)]">
              Last ingest: {formatRelativeShort(lastRun.startedAt)} · {lastRun.status}
            </span>
          )}
        </div>
        {message && <p className="mt-3 text-sm">{message}</p>}
        <dl className="mt-6 grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-[var(--grey)]">APIFY_TOKEN</dt>
            <dd className="font-medium">
              {process.env.NEXT_PUBLIC_HAS_APIFY === "1" ? "Configured" : "Not set (env)"}
            </dd>
          </div>
          <div>
            <dt className="text-[var(--grey)]">ANTHROPIC_API_KEY</dt>
            <dd className="font-medium">
              {process.env.NEXT_PUBLIC_HAS_ANTHROPIC === "1" ? "Configured" : "Not set (env)"}
            </dd>
          </div>
        </dl>
      </section>

      <section>
        <h2 className="mb-4 text-xl font-bold">Company LinkedIn URLs</h2>
        <div className="space-y-4">
          {rows.map((c) => (
            <form
              key={c.id}
              onSubmit={(e) => saveCompany(e, c.id)}
              className="border border-[var(--border)] p-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-bold">{c.name}</h3>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={busy || !c.linkedinUrl}
                    onClick={() => runIngest(c.slug)}
                    className="border border-[var(--border-strong)] px-3 py-1.5 text-xs hover:bg-[var(--muted-bg)] disabled:opacity-50"
                  >
                    Refresh
                  </button>
                  <button
                    type="submit"
                    disabled={busy}
                    className="bg-[var(--black)] px-3 py-1.5 text-xs text-[var(--white)] disabled:opacity-50"
                  >
                    Save
                  </button>
                </div>
              </div>
              <label className="mt-3 block text-sm">
                <span className="text-[var(--grey)]">LinkedIn company page URL</span>
                <input
                  name="linkedinUrl"
                  defaultValue={c.linkedinUrl ?? ""}
                  placeholder="https://www.linkedin.com/company/…"
                  className="mt-1 w-full border border-[var(--border)] px-2 py-1.5"
                />
              </label>
              <p className="mt-2 text-xs text-[var(--grey)]">
                Last fetched: {formatRelativeShort(c.lastFetchedAt)}
                {c.lastError ? ` · Error: ${c.lastError}` : ""}
              </p>
            </form>
          ))}
        </div>
      </section>
    </div>
  );
}
