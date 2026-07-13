import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { isValid } from "date-fns";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function slugify(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

/** Local calendar YYYY-MM-DD (avoids UTC shift from toISOString). */
export function toDateInputValue(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Parse a date filter. YYYY-MM-DD from <input type="date"> must be treated as a
 * local calendar day — NOT UTC midnight via parseISO (that shifts "today" back a day in the US).
 */
export function parseDateParam(value: string | null | undefined) {
  if (!value) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (m) {
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0, 0);
  }
  const d = new Date(value);
  return isValid(d) ? d : null;
}

export function startOfLocalDay(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
}

export function endOfLocalDay(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
}

/** True when the timestamp looks like a date-only midnight placeholder. */
export function looksLikeDateOnly(date: Date) {
  return (
    date.getHours() === 0 &&
    date.getMinutes() === 0 &&
    date.getSeconds() === 0 &&
    date.getMilliseconds() === 0
  );
}

export function formatFeedDate(
  date: Date | string | null | undefined,
  precision?: string | null,
) {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  if (!isValid(d)) return "—";

  if (precision === "unknown") {
    return `Detected ${d.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    })} (time unknown)`;
  }

  const dateOnly =
    precision === "date" || (!precision && looksLikeDateOnly(d));

  if (dateOnly) {
    return d.toLocaleDateString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  return d.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatRelativeShort(
  date: Date | string | null | undefined,
  precision?: string | null,
) {
  return formatFeedDate(date, precision);
}

export function formatLongDay(date = new Date()) {
  return date.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export function todayKey(date = new Date()) {
  return toDateInputValue(date);
}

export type CoercedPublish = {
  date: Date;
  precision: "datetime" | "date" | "unknown";
};

/** Coerce LinkedIn/RSS/HTML date fields into a real Date when possible. */
export function coercePublishedAt(
  raw: unknown,
  fallback?: Date | null,
): CoercedPublish | null {
  if (raw == null || raw === "") {
    return fallback ? { date: fallback, precision: "datetime" } : null;
  }

  if (raw instanceof Date && isValid(raw)) {
    return {
      date: raw,
      precision: looksLikeDateOnly(raw) ? "date" : "datetime",
    };
  }

  if (typeof raw === "number") {
    const ms = raw < 1e12 ? raw * 1000 : raw;
    const d = new Date(ms);
    if (!isValid(d)) return fallback ? { date: fallback, precision: "datetime" } : null;
    return {
      date: d,
      precision: looksLikeDateOnly(d) ? "date" : "datetime",
    };
  }

  if (typeof raw === "string") {
    const trimmed = raw.trim();
    // YYYY-MM-DD alone → local noon for sorting, but precision=date (no fake midnight UI)
    const dayOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
    if (dayOnly) {
      return {
        date: new Date(
          Number(dayOnly[1]),
          Number(dayOnly[2]) - 1,
          Number(dayOnly[3]),
          12,
          0,
          0,
          0,
        ),
        precision: "date",
      };
    }
    const d = new Date(trimmed);
    if (!isValid(d)) return fallback ? { date: fallback, precision: "datetime" } : null;
    return {
      date: d,
      precision: looksLikeDateOnly(d) ? "date" : "datetime",
    };
  }

  return fallback ? { date: fallback, precision: "datetime" } : null;
}

/** Snapshot of this machine's clock — for agent / verify tools. */
export function getSystemClock() {
  const now = new Date();
  return {
    iso: now.toISOString(),
    local: now.toLocaleString(undefined, {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
      timeZoneName: "short",
    }),
    dateInput: toDateInputValue(now),
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    offsetMinutes: now.getTimezoneOffset(),
  };
}
