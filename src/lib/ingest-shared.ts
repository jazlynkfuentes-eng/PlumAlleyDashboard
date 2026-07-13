import { createHash } from "crypto";
import { prisma } from "@/lib/prisma";
import { coercePublishedAt } from "@/lib/utils";
import type { SourceType } from "@prisma/client";

export type IngestUpdateInput = {
  companyId?: string;
  companySlug?: string;
  companyName?: string;
  sourceType: "linkedin" | "website";
  content: string;
  sourceUrl: string;
  publishedAt?: string | Date | null;
  title?: string | null;
  excerpt?: string | null;
  publishedAtPrecision?: "datetime" | "date" | "unknown";
  rawSource?: unknown;
  fetchStrategy?: string | null;
  externalId?: string | null;
  dateVerifyNote?: string | null;
  /** When a post_url already exists for the company, skip instead of updating. */
  onDuplicate?: "skip" | "update";
};

function hashId(input: string) {
  return createHash("sha256").update(input).digest("hex").slice(0, 24);
}

function sha256Hex(input: string) {
  return createHash("sha256").update(input).digest("hex");
}

function normalizeRawSource(raw: unknown): { json: string; sha: string } | null {
  if (raw == null) return null;
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    return { json: trimmed, sha: sha256Hex(trimmed) };
  }
  try {
    const json = JSON.stringify(raw);
    if (!json || json === "null") return null;
    return { json, sha: sha256Hex(json) };
  } catch {
    return null;
  }
}

/** Normalize any timestamp to a UTC Date (stored as Instant). */
export function toUtcDate(raw: string | Date | null | undefined, fallback = new Date()): Date {
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
    return new Date(raw.toISOString());
  }
  if (typeof raw === "string" && raw.trim()) {
    const coerced = coercePublishedAt(raw);
    if (coerced) return new Date(coerced.date.toISOString());
    const d = new Date(raw);
    if (!Number.isNaN(d.getTime())) return new Date(d.toISOString());
  }
  return new Date(fallback.toISOString());
}

export async function resolveCompany(input: IngestUpdateInput) {
  if (input.companyId) {
    return prisma.company.findUnique({ where: { id: input.companyId } });
  }
  if (input.companySlug) {
    return prisma.company.findUnique({ where: { slug: input.companySlug } });
  }
  if (input.companyName) {
    const name = input.companyName.trim();
    if (!name) return null;

    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const bySlug = await prisma.company.findUnique({ where: { slug } });
    if (bySlug) return bySlug;

    const lower = name.toLowerCase();
    const companies = await prisma.company.findMany();
    return companies.find((c) => c.name.toLowerCase() === lower) ?? null;
  }
  return null;
}

/**
 * Shared ingestion for website fetchers and n8n LinkedIn webhook.
 * Dedupes on (companyId, sourceUrl) and (companyId, sourceType, externalId).
 * Timestamps stored as UTC.
 */
export async function ingestUpdateRow(input: IngestUpdateInput) {
  const company = await resolveCompany(input);
  if (!company) {
    return { ok: false as const, error: "company_not_found", inserted: false };
  }

  const sourceUrl = input.sourceUrl.trim();
  if (!sourceUrl) {
    return { ok: false as const, error: "source_url_required", inserted: false };
  }

  const content = input.content?.trim() || input.excerpt?.trim() || "";
  if (!content) {
    return { ok: false as const, error: "content_required", inserted: false };
  }

  const raw = normalizeRawSource(input.rawSource);
  if (input.sourceType === "linkedin" && !raw) {
    return { ok: false as const, error: "raw_source_required", inserted: false };
  }

  const precision =
    input.publishedAtPrecision ??
    (input.publishedAt ? coercePublishedAt(input.publishedAt)?.precision ?? "datetime" : "unknown");

  const publishedAt = toUtcDate(
    input.publishedAt,
    precision === "unknown" ? new Date() : new Date(),
  );

  const externalId = input.externalId?.trim() || hashId(sourceUrl);
  const excerpt = (input.excerpt ?? content).slice(0, 500);
  const title = input.title ?? null;
  const sourceType = input.sourceType as SourceType;

  // Prefer sourceUrl unique dedupe
  const existingByUrl = await prisma.update.findUnique({
    where: {
      companyId_sourceUrl: { companyId: company.id, sourceUrl },
    },
  });

  if (existingByUrl) {
    if (input.onDuplicate === "skip") {
      return {
        ok: true as const,
        inserted: false,
        updated: false,
        skipped: true,
        updateId: existingByUrl.id,
        companyId: company.id,
      };
    }

    await prisma.update.update({
      where: { id: existingByUrl.id },
      data: {
        title,
        excerpt,
        content,
        publishedAt,
        publishedAtPrecision: precision,
        rawSource: raw?.json ?? existingByUrl.rawSource,
        rawSourceSha: raw?.sha ?? existingByUrl.rawSourceSha,
        fetchStrategy: input.fetchStrategy ?? existingByUrl.fetchStrategy,
        dateVerifyNote: input.dateVerifyNote ?? existingByUrl.dateVerifyNote,
        fetchedAt: new Date(),
      },
    });
    return {
      ok: true as const,
      inserted: false,
      updated: true,
      updateId: existingByUrl.id,
      companyId: company.id,
    };
  }

  try {
    const created = await prisma.update.create({
      data: {
        companyId: company.id,
        sourceType,
        sourceUrl,
        title,
        excerpt,
        content,
        publishedAt,
        publishedAtPrecision: precision,
        rawSource: raw?.json ?? null,
        rawSourceSha: raw?.sha ?? null,
        fetchStrategy: input.fetchStrategy ?? null,
        dateVerifyNote: input.dateVerifyNote ?? null,
        externalId,
      },
    });
    return {
      ok: true as const,
      inserted: true,
      updated: false,
      updateId: created.id,
      companyId: company.id,
    };
  } catch {
    // race / unique on externalId
    const existing = await prisma.update.findUnique({
      where: {
        companyId_sourceType_externalId: {
          companyId: company.id,
          sourceType,
          externalId,
        },
      },
    });
    if (existing) {
      await prisma.update.update({
        where: { id: existing.id },
        data: {
          title,
          excerpt,
          content,
          publishedAt,
          publishedAtPrecision: precision,
          sourceUrl,
          rawSource: raw?.json ?? existing.rawSource,
          rawSourceSha: raw?.sha ?? existing.rawSourceSha,
          fetchStrategy: input.fetchStrategy ?? existing.fetchStrategy,
          fetchedAt: new Date(),
        },
      });
      return {
        ok: true as const,
        inserted: false,
        updated: true,
        updateId: existing.id,
        companyId: company.id,
      };
    }
    return { ok: false as const, error: "persist_failed", inserted: false };
  }
}

export async function ingestMany(rows: IngestUpdateInput[]) {
  const results = [];
  for (const row of rows) {
    try {
      results.push({ input: row, ...(await ingestUpdateRow(row)) });
    } catch (e) {
      results.push({
        input: row,
        ok: false as const,
        error: e instanceof Error ? e.message : "error",
        inserted: false,
      });
    }
  }
  return {
    total: results.length,
    inserted: results.filter((r) => "inserted" in r && r.inserted).length,
    updated: results.filter((r) => "updated" in r && r.updated).length,
    failed: results.filter((r) => !r.ok).length,
    results,
  };
}
