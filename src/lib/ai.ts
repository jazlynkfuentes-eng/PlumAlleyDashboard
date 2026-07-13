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
    select: { id: true, name: true, slug: true },
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

  const where: {
    sourceType: "linkedin";
    rawSource: { not: null };
    companyId?: { in: string[] };
    OR?: { excerpt?: { contains: string }; title?: { contains: string }; content?: { contains: string } }[];
  } = { sourceType: "linkedin", rawSource: { not: null } };

  if (matchedCompanies.length > 0) {
    where.companyId = { in: matchedCompanies.map((c) => c.id) };
  }

  if (keywords.length > 0 && matchedCompanies.length === 0) {
    where.OR = keywords.flatMap((k) => [
      { excerpt: { contains: k } },
      { title: { contains: k } },
      { content: { contains: k } },
    ]);
  }

  const updates = await prisma.update.findMany({
    where,
    include: { company: true },
    orderBy: { publishedAt: "desc" },
    take: 20,
  });

  const citations: Citation[] = updates.map((u) => ({
    id: u.id,
    companyName: u.company.name,
    sourceType: u.sourceType,
    sourceUrl: u.sourceUrl,
    title: u.title,
    excerpt: u.excerpt,
    publishedAt: u.publishedAt.toISOString(),
  }));

  const corpus = citations
    .map(
      (c, i) =>
        `[${i + 1}] ${c.companyName} | LinkedIn | ${c.publishedAt.slice(0, 10)}\n${c.title ?? ""}\n${c.excerpt}\n${c.sourceUrl}`,
    )
    .join("\n\n");

  const client = getClient();
  let answer: string;

  if (!client) {
    if (citations.length === 0) {
      answer =
        "I don't have stored LinkedIn company-page posts matching that question yet. Run the n8n LinkedIn workflow or broaden the query.";
    } else {
      const lines = citations.slice(0, 5).map(
        (c, i) =>
          `${i + 1}. ${c.companyName}: ${c.excerpt.slice(0, 140)}… — ${c.sourceUrl}`,
      );
      answer = `Based on stored LinkedIn posts:\n\n${lines.join("\n")}`;
    }
  } else {
    const message = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 800,
      messages: [
        {
          role: "user",
          content: `You are an intelligence assistant for a private portfolio dashboard.
Answer ONLY using the stored official LinkedIn company-page posts below.
Cite sources using [n] notation matching the numbered list. Include source URLs in your answer.
If the corpus is insufficient, say so clearly. Never invent third-party news or website content.

Question: ${question}

Corpus:
${corpus || "(no matching LinkedIn posts)"}`,
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
