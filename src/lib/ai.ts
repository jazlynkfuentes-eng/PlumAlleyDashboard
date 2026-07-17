import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";
import { endOfLocalDay, startOfLocalDay } from "@/lib/utils";

function getClient() {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  return new Anthropic({ apiKey: key });
}

export type Citation = {
  id: string;
  companyName: string;
  sourceType: string;
  sourceUrl: string;
  title: string | null;
  excerpt: string;
  publishedAt: string;
};

export async function generateCompanySummary(
  companyId: string,
  date = new Date(),
): Promise<string | null> {
  const from = startOfLocalDay(date);
  const to = endOfLocalDay(date);

  const company = await prisma.company.findUnique({ where: { id: companyId } });
  if (!company) return null;

  const updates = await prisma.update.findMany({
    where: {
      companyId,
      sourceType: "linkedin",
      rawSource: { not: null },
      publishedAt: { gte: from, lte: to },
    },
    orderBy: { publishedAt: "desc" },
  });

  if (updates.length === 0) {
    // Also consider recently fetched today even if published earlier this week
    const recent = await prisma.update.findMany({
      where: {
        companyId,
        sourceType: "linkedin",
        rawSource: { not: null },
        fetchedAt: { gte: from, lte: to },
      },
      orderBy: { publishedAt: "desc" },
      take: 8,
    });
    if (recent.length === 0) return null;

    const content = await summarizeTexts(company.name, recent);
    if (!content) return null;

    const summaryDate = startOfLocalDay(date);
    await prisma.dailySummary.upsert({
      where: {
        companyId_summaryDate: { companyId, summaryDate },
      },
      create: {
        companyId,
        summaryDate,
        content,
        citedUpdateIds: JSON.stringify(recent.map((u) => u.id)),
      },
      update: {
        content,
        citedUpdateIds: JSON.stringify(recent.map((u) => u.id)),
      },
    });
    return content;
  }

  const content = await summarizeTexts(company.name, updates);
  if (!content) return null;

  const summaryDate = startOfLocalDay(date);
  await prisma.dailySummary.upsert({
    where: {
      companyId_summaryDate: { companyId, summaryDate },
    },
    create: {
      companyId,
      summaryDate,
      content,
      citedUpdateIds: JSON.stringify(updates.map((u) => u.id)),
    },
    update: {
      content,
      citedUpdateIds: JSON.stringify(updates.map((u) => u.id)),
    },
  });
  return content;
}

async function summarizeTexts(
  companyName: string,
  updates: {
    id: string;
    sourceType: string;
    sourceUrl: string;
    title: string | null;
    excerpt: string;
    content: string;
  }[],
) {
  const client = getClient();
  const corpus = updates
    .map(
      (u, i) =>
        `[${i + 1}] (${u.sourceType}) ${u.title ?? ""}\n${u.excerpt || u.content}\nURL: ${u.sourceUrl}`,
    )
    .join("\n\n");

  if (!client) {
    // Deterministic offline fallback
    const first = updates[0];
    return `${companyName} shared ${updates.length} official update${updates.length === 1 ? "" : "s"} today. Highlight: ${first.excerpt.slice(0, 220)}`;
  }

  const message = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 400,
    messages: [
      {
        role: "user",
        content: `You are writing a concise daily intelligence summary for an investor monitoring official company communications only.

Company: ${companyName}

Official posts/updates:
${corpus}

Write 2-4 sentences summarizing what the company posted on its official LinkedIn page. Do not invent facts. Do not use third-party news or website content.`,
      },
    ],
  });

  const block = message.content.find((b) => b.type === "text");
  return block && block.type === "text" ? block.text : null;
}

export async function answerPortfolioQuestion(
  question: string,
  sessionId?: string | null,
): Promise<{ answer: string; citations: Citation[]; sessionId: string }> {
  let session =
    sessionId
      ? await prisma.chatSession.findUnique({ where: { id: sessionId } })
      : null;
  if (!session) {
    session = await prisma.chatSession.create({ data: {} });
  }

  await prisma.chatMessage.create({
    data: {
      sessionId: session.id,
      role: "user",
      content: question,
    },
  });

  const companies = await prisma.company.findMany({
    select: {
      id: true,
      name: true,
      slug: true,
      description: true,
      tags: true,
    },
  });

  const lower = question.toLowerCase();
  const matchedCompanies = companies.filter(
    (c) =>
      lower.includes(c.name.toLowerCase()) ||
      lower.includes(c.slug.replace(/-/g, " ")) ||
      lower.includes(c.slug),
  );

  const keywords = question
    .split(/\s+/)
    .map((w) => w.replace(/[^a-zA-Z0-9]/g, ""))
    .filter((w) => w.length > 3)
    .slice(0, 8);

  type UpdateWhere = {
    sourceType: "linkedin" | "website";
    rawSource?: { not: null };
    companyId?: { in: string[] };
    OR?: {
      excerpt?: { contains: string };
      title?: { contains: string };
      content?: { contains: string };
    }[];
  };

  const sharedFilters: Pick<UpdateWhere, "companyId" | "OR"> = {};
  if (matchedCompanies.length > 0) {
    sharedFilters.companyId = { in: matchedCompanies.map((c) => c.id) };
  }
  if (keywords.length > 0 && matchedCompanies.length === 0) {
    sharedFilters.OR = keywords.flatMap((k) => [
      { excerpt: { contains: k } },
      { title: { contains: k } },
      { content: { contains: k } },
    ]);
  }

  const corpusLimit = 20;
  // Fetch enough of each source to build a balanced mix (LinkedIn must have scraper evidence).
  const perSourceTake = corpusLimit;

  const [linkedinUpdates, websiteUpdates] = await Promise.all([
    prisma.update.findMany({
      where: {
        ...sharedFilters,
        sourceType: "linkedin",
        rawSource: { not: null },
      },
      include: { company: true },
      orderBy: { publishedAt: "desc" },
      take: perSourceTake,
    }),
    prisma.update.findMany({
      where: {
        ...sharedFilters,
        sourceType: "website",
      },
      include: { company: true },
      orderBy: { publishedAt: "desc" },
      take: perSourceTake,
    }),
  ]);

  const updates = pickMixedSourceUpdates(
    linkedinUpdates,
    websiteUpdates,
    corpusLimit,
  );

  const citations: Citation[] = updates.map((u) => ({
    id: u.id,
    companyName: u.company.name,
    sourceType: u.sourceType,
    sourceUrl: u.sourceUrl,
    title: u.title,
    excerpt: u.excerpt,
    publishedAt: u.publishedAt.toISOString(),
  }));

  const companiesInContext = companies.filter(
    (c) =>
      matchedCompanies.some((m) => m.id === c.id) ||
      updates.some((u) => u.companyId === c.id),
  );

  const companyProfiles =
    companiesInContext.length > 0
      ? companiesInContext
          .map((c) => {
            const tags =
              c.tags.length > 0 ? c.tags.join(", ") : "(none listed)";
            const desc = c.description.trim() || "(no description on file)";
            return `- ${c.name}: ${desc}\n  Tags: ${tags}`;
          })
          .join("\n")
      : "(no matched company profiles)";

  const sourceLabel = (sourceType: string) =>
    sourceType === "website" ? "Website/News" : "LinkedIn";

  const corpus = citations
    .map(
      (c, i) =>
        `[${i + 1}] ${c.companyName} | ${sourceLabel(c.sourceType)} | ${c.publishedAt.slice(0, 10)}\n${c.title ?? ""}\n${c.excerpt}\n${c.sourceUrl}`,
    )
    .join("\n\n");

  const client = getClient();
  let answer: string;

  if (!client) {
    if (citations.length === 0) {
      answer =
        "I don't have stored LinkedIn or website/news updates matching that question yet. Run the n8n LinkedIn workflow and daily website ingest, or broaden the query.";
    } else {
      // Offline fallback: still prefer a short synthesized blurb over a raw list.
      const top = citations.slice(0, 4);
      const companies = [...new Set(top.map((c) => c.companyName))];
      const lead = top[0];
      answer = `${companies.join(", ")} ${companies.length === 1 ? "has" : "have"} recent activity in the stored feed. The clearest signal is from ${lead.companyName}: ${lead.excerpt.slice(0, 180).trim()}${lead.excerpt.length > 180 ? "…" : ""} [1]. Other matching updates are available in the citations below — connect ANTHROPIC_API_KEY for a full synthesized briefing.`;
    }
  } else {
    const message = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 800,
      messages: [
        {
          role: "user",
          content: `You are an intelligence assistant for a private portfolio dashboard.

Answer ONLY using the company profiles and stored updates below.
Your sources are: (1) official LinkedIn company-page posts and (2) company website/news/blog updates stored in this dashboard.
If the user asks what sources you use, say clearly that you draw on stored LinkedIn posts and website/news content from the portfolio companies — not the open web.

Writing style (critical):
- Write like a knowledgeable analyst explaining what's going on in a short briefing, not like a search-results dump.
- Use full sentences and short paragraphs (typically 1–3 paragraphs). Do NOT restate each post as its own bullet or numbered item.
- Synthesize across sources: combine related posts into one clear point instead of summarizing them one-by-one.
- Lead with the most important or newsworthy takeaway, then add supporting context.
- Place citation markers like [1] or [2] inline inside the sentences they support. Do not put a bare citation list at the end instead of weaving them in.
- Stay strictly grounded in the provided profiles and updates — never invent facts, dates, or claims. If the corpus is thin, say what you can and note what's missing.
- Prefer plain, easy-to-understand language over jargon. You may use company descriptions/tags for context about what a company does.

Question: ${question}

Company profiles:
${companyProfiles}

Updates corpus:
${corpus || "(no matching LinkedIn or website/news updates)"}`,
        },
      ],
    });
    const block = message.content.find((b) => b.type === "text");
    answer =
      block && block.type === "text"
        ? block.text
        : "Unable to generate an answer right now.";
  }

  await prisma.chatMessage.create({
    data: {
      sessionId: session.id,
      role: "assistant",
      content: answer,
      citations: JSON.stringify(citations),
    },
  });

  return { answer, citations, sessionId: session.id };
}

/**
 * Build a ~limit corpus that mixes LinkedIn and website items instead of
 * letting one source type dominate a pure publishedAt sort.
 * Reserves up to half the slots for each source when both exist, then fills
 * remaining slots by recency.
 */
function pickMixedSourceUpdates<
  T extends { id: string; sourceType: string; publishedAt: Date },
>(linkedin: T[], website: T[], limit: number): T[] {
  if (linkedin.length === 0) return website.slice(0, limit);
  if (website.length === 0) return linkedin.slice(0, limit);

  const half = Math.floor(limit / 2);
  const primaryLi = linkedin.slice(0, half);
  const primaryWeb = website.slice(0, half);
  const used = new Set([...primaryLi, ...primaryWeb].map((u) => u.id));

  const leftovers = [...linkedin, ...website]
    .filter((u) => !used.has(u.id))
    .sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime());

  const mixed = [...primaryLi, ...primaryWeb, ...leftovers].slice(0, limit);
  return mixed.sort(
    (a, b) => b.publishedAt.getTime() - a.publishedAt.getTime(),
  );
}
