import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { ingestUpdateRow } from "@/lib/ingest-shared";
import { coercePublishedAt } from "@/lib/utils";

function authorized(req: Request) {
  const header = req.headers.get("authorization") ?? "";
  const bearer = header.startsWith("Bearer ") ? header.slice(7) : "";
  const ingestSecret =
    process.env.INGEST_SECRET ?? process.env.CRON_SECRET ?? "dev-cron-secret";
  return bearer === ingestSecret;
}

type LinkedInPostPayload = {
  company_name: string;
  post_content: string;
  post_url: string;
  published_at: string;
  raw_source: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validatePayload(
  body: unknown,
): { ok: true; data: LinkedInPostPayload } | { ok: false; status: number; error: string; message: string } {
  if (!isRecord(body)) {
    return {
      ok: false,
      status: 400,
      error: "invalid_json",
      message: "Request body must be a JSON object.",
    };
  }

  const companyName = typeof body.company_name === "string" ? body.company_name.trim() : "";
  if (!companyName) {
    return {
      ok: false,
      status: 400,
      error: "company_name_required",
      message: "company_name is required (string).",
    };
  }

  const postContent = typeof body.post_content === "string" ? body.post_content.trim() : "";
  if (!postContent) {
    return {
      ok: false,
      status: 400,
      error: "post_content_required",
      message: "post_content is required (string).",
    };
  }

  const postUrl = typeof body.post_url === "string" ? body.post_url.trim() : "";
  if (!postUrl) {
    return {
      ok: false,
      status: 400,
      error: "post_url_required",
      message: "post_url is required (string).",
    };
  }

  const publishedAt =
    typeof body.published_at === "string" ? body.published_at.trim() : "";
  if (!publishedAt) {
    return {
      ok: false,
      status: 400,
      error: "published_at_required",
      message: "published_at is required (ISO date string).",
    };
  }
  if (!coercePublishedAt(publishedAt)) {
    return {
      ok: false,
      status: 400,
      error: "published_at_invalid",
      message: `published_at is not a valid ISO date: "${publishedAt}".`,
    };
  }

  if (body.raw_source == null) {
    return {
      ok: false,
      status: 400,
      error: "raw_source_required",
      message:
        "raw_source is required (object). Posts without scraper evidence are rejected.",
    };
  }
  if (typeof body.raw_source !== "object" || Array.isArray(body.raw_source)) {
    return {
      ok: false,
      status: 400,
      error: "raw_source_invalid",
      message: "raw_source must be a JSON object (the full scraped post).",
    };
  }

  return {
    ok: true,
    data: {
      company_name: companyName,
      post_content: postContent,
      post_url: postUrl,
      published_at: publishedAt,
      raw_source: body.raw_source,
    },
  };
}

function responseForResult(
  payload: LinkedInPostPayload,
  result: Awaited<ReturnType<typeof ingestUpdateRow>>,
) {
  if (!result.ok) {
    if (result.error === "company_not_found") {
      return NextResponse.json(
        {
          success: false,
          status: "error",
          error: "company_not_found",
          message: `No company found matching "${payload.company_name}".`,
        },
        { status: 404 },
      );
    }
    if (result.error === "raw_source_required") {
      return NextResponse.json(
        {
          success: false,
          status: "error",
          error: "raw_source_required",
          message:
            "raw_source is required (object). Posts without scraper evidence are rejected.",
        },
        { status: 400 },
      );
    }
    return NextResponse.json(
      {
        success: false,
        status: "error",
        error: result.error,
        message: `Ingest failed: ${result.error}.`,
      },
      { status: 400 },
    );
  }

  if ("skipped" in result && result.skipped) {
    return NextResponse.json({
      success: true,
      status: "skipped",
      message: "Post already exists for this company — skipped (no duplicate created).",
      updateId: result.updateId,
      company_name: payload.company_name,
      post_url: payload.post_url,
    });
  }

  if (result.inserted) {
    return NextResponse.json(
      {
        success: true,
        status: "inserted",
        message: `LinkedIn post stored for ${payload.company_name}.`,
        updateId: result.updateId,
        company_name: payload.company_name,
        post_url: payload.post_url,
      },
      { status: 201 },
    );
  }

  return NextResponse.json({
    success: true,
    status: "updated",
    message: `Existing post updated for ${payload.company_name}.`,
    updateId: result.updateId,
    company_name: payload.company_name,
    post_url: payload.post_url,
  });
}

/**
 * n8n LinkedIn ingest webhook.
 *
 * GET  /api/updates/linkedin  — health check (no auth)
 * POST /api/updates/linkedin  — ingest one post (Bearer INGEST_SECRET)
 */
export async function GET() {
  return NextResponse.json({
    ok: true,
    endpoint: "/api/updates/linkedin",
    method: "POST",
    auth: "Authorization: Bearer <INGEST_SECRET>",
    required_fields: [
      "company_name",
      "post_content",
      "post_url",
      "published_at",
      "raw_source",
    ],
    docs: "See N8N.md in project root",
  });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user && !authorized(req)) {
    return NextResponse.json(
      {
        success: false,
        status: "error",
        error: "unauthorized",
        message: "Missing or invalid Authorization bearer token (INGEST_SECRET).",
      },
      { status: 401 },
    );
  }

  const body = await req.json().catch(() => null);
  if (body == null) {
    return NextResponse.json(
      {
        success: false,
        status: "error",
        error: "invalid_json",
        message: "Request body must be valid JSON.",
      },
      { status: 400 },
    );
  }

  const validated = validatePayload(body);
  if (!validated.ok) {
    return NextResponse.json(
      {
        success: false,
        status: "error",
        error: validated.error,
        message: validated.message,
      },
      { status: validated.status },
    );
  }

  const payload = validated.data;
  const precision = coercePublishedAt(payload.published_at)?.precision ?? "datetime";

  const result = await ingestUpdateRow({
    companyName: payload.company_name,
    sourceType: "linkedin",
    content: payload.post_content,
    sourceUrl: payload.post_url,
    publishedAt: payload.published_at,
    publishedAtPrecision: precision,
    title: payload.post_content.slice(0, 80),
    excerpt: payload.post_content.slice(0, 500),
    rawSource: payload.raw_source,
    fetchStrategy: "n8n_apify_company_posts",
    onDuplicate: "skip",
  });

  return responseForResult(payload, result);
}
