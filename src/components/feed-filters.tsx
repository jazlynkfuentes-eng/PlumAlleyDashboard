"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { toDateInputValue } from "@/lib/utils";

type CompanyOption = { slug: string; name: string };

export function FeedFilters({
  companies,
  defaultDate,
}: {
  companies: CompanyOption[];
  defaultDate: string;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  function update(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (key === "date") {
      if (!value || value === toDateInputValue()) next.delete("date");
      else next.set("date", value);
    } else if (!value) {
      next.delete(key);
    } else {
      next.set(key, value);
    }
    startTransition(() => {
      const qs = next.toString();
      router.push(qs ? `/?${qs}` : "/");
    });
  }

  const dateValue = params.get("date") ?? defaultDate;

  return (
    <div
      className={`grid gap-3 border border-[var(--border)] p-4 sm:grid-cols-3 ${pending ? "opacity-70" : ""}`}
    >
      <label className="block text-sm">
        <span className="mb-1 block text-[var(--grey)]">Date</span>
        <input
          type="date"
          value={dateValue}
          max={toDateInputValue()}
          onChange={(e) => update("date", e.target.value)}
          className="w-full border border-[var(--border-strong)] bg-[var(--white)] px-3 py-2 outline-none focus:border-[var(--black)]"
        />
      </label>
      <label className="block text-sm">
        <span className="mb-1 block text-[var(--grey)]">Company</span>
        <select
          defaultValue={params.get("company") ?? ""}
          onChange={(e) => update("company", e.target.value)}
          className="w-full border border-[var(--border-strong)] bg-[var(--white)] px-3 py-2 outline-none focus:border-[var(--black)]"
        >
          <option value="">All companies</option>
          {companies.map((c) => (
            <option key={c.slug} value={c.slug}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-sm">
        <span className="mb-1 block text-[var(--grey)]">Keyword</span>
        <input
          type="search"
          defaultValue={params.get("q") ?? ""}
          placeholder="Search posts…"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              update("q", (e.target as HTMLInputElement).value);
            }
          }}
          onBlur={(e) => update("q", e.target.value)}
          className="w-full border border-[var(--border-strong)] bg-[var(--white)] px-3 py-2 outline-none focus:border-[var(--black)]"
        />
      </label>
    </div>
  );
}
