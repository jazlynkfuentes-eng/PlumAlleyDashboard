import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";
import { endOfLocalDay, startOfLocalDay } from "@/lib/utils";

/** Current Claude Sonnet — see https://docs.anthropic.com/en/docs/about-claude/models/overview */
const ANTHROPIC_MODEL = "claude-sonnet-5";

function getClient() {
  const key = process.env.ANTHROPIC_API_KEY?.trim();
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
    model: ANTHROPIC_MODEL,
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
      model: ANTHROPIC_MODEL,
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

export const DEFAULT_INTELLIGENCE_WINDOW_DAYS = 30;

export type IntelligenceSections = {
  happening?: string;
  mattersBecause?: string;
  comparedToPeers?: string;
};

export type IntelligencePeerContext = {
  peerCompanyIds?: string[];
  peerUpdateIds?: string[];
  peersOmittedReason?: string;
};

type IntelligenceUpdate = {
  id: string;
  companyId: string;
  sourceType: string;
  sourceUrl: string;
  title: string | null;
  excerpt: string;
  content: string;
  publishedAt: Date;
};

function windowStart(windowDays: number) {
  const from = new Date();
  from.setDate(from.getDate() - windowDays);
  from.setHours(0, 0, 0, 0);
  return from;
}

function updateWindowWhere(companyId: string, from: Date) {
  return {
    companyId,
    publishedAt: { gte: from },
    OR: [
      { sourceType: "linkedin" as const, rawSource: { not: null } },
      { sourceType: "website" as const },
    ],
  };
}

async function fetchCompanyUpdatesInWindow(
  companyId: string,
  windowDays: number,
  take = 24,
): Promise<IntelligenceUpdate[]> {
  const from = windowStart(windowDays);
  return prisma.update.findMany({
    where: updateWindowWhere(companyId, from),
    orderBy: { publishedAt: "desc" },
    take,
  });
}

async function selectPeerCompanies(
  company: { id: string; sector: string },
  windowDays: number,
): Promise<{ peers: { id: string; name: string }[]; peerUpdates: IntelligenceUpdate[] }> {
  const from = windowStart(windowDays);
  const candidates = await prisma.company.findMany({
    where: {
      sector: company.sector,
      id: { not: company.id },
    },
    select: { id: true, name: true },
  });

  if (candidates.length === 0) {
    return { peers: [], peerUpdates: [] };
  }

  const counts = await Promise.all(
    candidates.map(async (peer) => {
      const count = await prisma.update.count({
        where: updateWindowWhere(peer.id, from),
      });
      return { peer, count };
    }),
  );

  const qualified = counts
    .filter((c) => c.count >= 2)
    .sort((a, b) => b.count - a.count)
    .slice(0, 2)
    .map((c) => c.peer);

  if (qualified.length === 0) {
    return { peers: [], peerUpdates: [] };
  }

  const peerUpdates = await prisma.update.findMany({
    where: {
      companyId: { in: qualified.map((p) => p.id) },
      publishedAt: { gte: from },
      OR: [
        { sourceType: "linkedin", rawSource: { not: null } },
        { sourceType: "website" },
      ],
    },
    orderBy: { publishedAt: "desc" },
    take: 12,
  });

  return { peers: qualified, peerUpdates };
}

function sourceLabel(sourceType: string) {
  return sourceType === "website" ? "Website/News" : "LinkedIn";
}

function formatCorpus(
  updates: IntelligenceUpdate[],
  companyNames: Map<string, string>,
) {
  return updates
    .map((u, i) => {
      const name = companyNames.get(u.companyId) ?? "Company";
      return `[${i + 1}] ${name} | ${sourceLabel(u.sourceType)} | ${u.publishedAt.toISOString().slice(0, 10)}\n${u.title ?? ""}\n${u.excerpt || u.content}\n${u.sourceUrl}`;
    })
    .join("\n\n");
}

function renderIntelligenceContent(sections: IntelligenceSections): string {
  const parts: string[] = [];
  if (sections.happening?.trim()) {
    parts.push(`Here's what's been happening...\n\n${sections.happening.trim()}`);
  }
  if (sections.mattersBecause?.trim()) {
    parts.push(`This matters because...\n\n${sections.mattersBecause.trim()}`);
  }
  if (sections.comparedToPeers?.trim()) {
    parts.push(`Compared to peers...\n\n${sections.comparedToPeers.trim()}`);
  }
  return parts.join("\n\n");
}

function parseIntelligenceSections(raw: string): IntelligenceSections {
  try {
    const parsed = JSON.parse(raw) as Partial<IntelligenceSections>;
    return {
      happening: typeof parsed.happening === "string" ? parsed.happening : undefined,
      mattersBecause:
        typeof parsed.mattersBecause === "string" ? parsed.mattersBecause : undefined,
      comparedToPeers:
        typeof parsed.comparedToPeers === "string" ? parsed.comparedToPeers : undefined,
    };
  } catch {
    return {};
  }
}

function offlineIntelligenceSections(
  companyName: string,
  updates: IntelligenceUpdate[],
  peers: { id: string; name: string }[],
  peerUpdates: IntelligenceUpdate[],
): IntelligenceSections {
  if (updates.length === 0) {
    return {
      happening:
        "No significant public activity was detected in the stored LinkedIn and website/news feed for this window.",
    };
  }

  const linkedin = updates.filter((u) => u.sourceType === "linkedin").length;
  const website = updates.filter((u) => u.sourceType === "website").length;
  const lead = updates[0];
  const happening = `${companyName} has ${updates.length} stored update${updates.length === 1 ? "" : "s"} in this window (${linkedin} LinkedIn, ${website} website/news). The most recent signal: ${lead.excerpt.slice(0, 280).trim()}${lead.excerpt.length > 280 ? "…" : ""}`;

  const sections: IntelligenceSections = { happening };

  if (peers.length > 0 && peerUpdates.length >= 2) {
    const peerNames = peers.map((p) => p.name).join(" and ");
    sections.comparedToPeers = `Peer context from ${peerNames} (${peerUpdates.length} updates in the same sector/window) is available for comparison once ANTHROPIC_API_KEY is configured for full synthesis.`;
  }

  return sections;
}

export async function generateCompanyIntelligenceSummary(
  companyId: string,
  options?: { force?: boolean; windowDays?: number },
): Promise<{ skipped: boolean; reason?: string } | { generated: true; id: string }> {
  const windowDays = options?.windowDays ?? DEFAULT_INTELLIGENCE_WINDOW_DAYS;
  const force = options?.force === true;

  const company = await prisma.company.findUnique({ where: { id: companyId } });
  if (!company) return { skipped: true, reason: "company_not_found" };

  if (!force) {
    const existing = await prisma.companyIntelligenceSummary.findUnique({
      where: { companyId },
    });
    if (existing && existing.generatedAt >= startOfLocalDay()) {
      return { skipped: true, reason: "already_generated_today" };
    }
  }

  const updates = await fetchCompanyUpdatesInWindow(companyId, windowDays);
  const { peers, peerUpdates } = await selectPeerCompanies(company, windowDays);

  const companyNames = new Map<string, string>([[company.id, company.name]]);
  for (const peer of peers) companyNames.set(peer.id, peer.name);

  const targetCorpus = formatCorpus(updates, companyNames);
  const peerCorpus =
    peerUpdates.length > 0 ? formatCorpus(peerUpdates, companyNames) : "";

  const client = getClient();
  let sections: IntelligenceSections;

  if (!client) {
    sections = offlineIntelligenceSections(company.name, updates, peers, peerUpdates);
  } else {
    const peerBlock =
      peers.length > 0 && peerUpdates.length >= 2
        ? `\n\nPeer companies (same sector: ${company.sector}):\n${peers.map((p) => `- ${p.name}`).join("\n")}\n\nPeer updates corpus:\n${peerCorpus}`
        : "\n\n(No sufficient peer activity in this window — omit section 3 entirely.)";

    try {
      const message = await client.messages.create({
        model: ANTHROPIC_MODEL,
        max_tokens: 1200,
        messages: [
          {
            role: "user",
            content: `You are writing a company intelligence briefing for a private portfolio dashboard.

Company: ${company.name}
Sector: ${company.sector}
Window: last ${windowDays} days

Use ONLY the updates below. Do not invent facts, funding rounds, hires, or events not supported by the text.

Target company updates:
${targetCorpus || "(no updates in window)"}
${peerBlock}

Return ONLY valid JSON (no markdown fences) with up to three optional string fields:

- "happening": factual synthesis of recent activity (LinkedIn + website/news). Write as much as the data supports — omit if there is no real activity.

- "mattersBecause": investor-relevant analysis of WHY the specific facts in "happening" matter — NOT a restatement of section 1.
  Requirements:
  • Name the SPECIFIC thing(s) from the posts (product name, partnership, funding, hire, event, launch, conference, customer win, etc.) — never vague labels like "activity", "communications", or "updates".
  • Explain WHY that specific thing matters using reasoning tied to that fact. Examples of the kind of analysis expected:
    - Product unveiling/launch: what capability does it add; is this a first-time announcement or an incremental update?
    - Event/conference: marketing presence only, or a signal about sales motion, customer base, or competitive positioning?
    - Partnership: who is the partner and what does it signal about validation or market expansion?
    - Hire/team change: what does the role suggest about priorities (e.g., first sales hire → scaling go-to-market)?
  • Build on facts already established in "happening" — do not introduce new claims not in the corpus.
  • Do NOT paraphrase or lightly reword the raw post text as your analysis. Section 2 must add interpretive value beyond section 1.
  • FORBIDDEN filler (never use these or close variants): "ongoing activity", "worth monitoring", "official communications suggest", "go-to-market or product narrative activity", "portfolio milestones", "signals continued momentum", "remains active in the market".
  • If you cannot identify something specific and analytically meaningful to say about WHY it matters, omit "mattersBecause" entirely — do not pad with generic corporate-speak.

- "comparedToPeers": comparative note using peer updates only when peer corpus exists — omit if peers are absent or thin.

Rules:
- Omit any section key entirely when there is not enough evidence (do not pad or speculate).
- Use plain analyst prose inside each field (no bullet lists unless the source material demands it).
- Do not include section titles inside the JSON values.
- "happening" = what happened (facts). "mattersBecause" = why those facts matter to an investor (analysis). Keep them distinct.`,
          },
        ],
      });

      const block = message.content.find((b) => b.type === "text");
      const text = block && block.type === "text" ? block.text.trim() : "{}";
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      sections = parseIntelligenceSections(jsonMatch?.[0] ?? text);
    } catch (err) {
      console.error(
        `[intelligence-summary] Anthropic API failed for ${company.name}:`,
        err instanceof Error ? err.message : err,
      );
      throw err;
    }
  }

  const citedUpdateIds = updates.map((u) => u.id);
  const peerContext: IntelligencePeerContext =
    peers.length > 0 && peerUpdates.length >= 2
      ? {
          peerCompanyIds: peers.map((p) => p.id),
          peerUpdateIds: peerUpdates.map((u) => u.id),
        }
      : {
          peersOmittedReason:
            peers.length === 0
              ? "no_same_sector_peers"
              : "insufficient_peer_activity",
        };

  const content = renderIntelligenceContent(sections);
  const record = await prisma.companyIntelligenceSummary.upsert({
    where: { companyId },
    create: {
      companyId,
      windowDays,
      content,
      sectionsJson: JSON.stringify(sections),
      citedUpdateIds: JSON.stringify(citedUpdateIds),
      peerContextJson: JSON.stringify(peerContext),
      generatedAt: new Date(),
    },
    update: {
      windowDays,
      content,
      sectionsJson: JSON.stringify(sections),
      citedUpdateIds: JSON.stringify(citedUpdateIds),
      peerContextJson: JSON.stringify(peerContext),
      generatedAt: new Date(),
    },
  });

  return { generated: true, id: record.id };
}

/** Companies per summary-regen HTTP request — keep under Amplify's ~30s ceiling. */
export const SUMMARY_REGEN_BATCH_SIZE = 1;

export type SummaryRegenBatchResult = {
  done: boolean;
  nextOffset: number | null;
  processed: number;
  total: number;
  force: boolean;
};

/**
 * Regenerate a slice of company intelligence summaries.
 * Used by /api/jobs/regenerate-summaries so full-portfolio regen stays
 * within request timeouts (unlike regenerating all 33 in one after()).
 */
export async function regenerateCompanyIntelligenceSummariesBatch(options?: {
  force?: boolean;
  offset?: number;
  limit?: number;
  companyIds?: string[];
}): Promise<SummaryRegenBatchResult> {
  const force = options?.force === true;
  const offset = Math.max(0, options?.offset ?? 0);
  const limit = Math.max(1, options?.limit ?? SUMMARY_REGEN_BATCH_SIZE);

  const companies = options?.companyIds?.length
    ? await prisma.company.findMany({
        where: { id: { in: options.companyIds } },
        select: { id: true },
        orderBy: { name: "asc" },
      })
    : await prisma.company.findMany({
        select: { id: true },
        orderBy: { name: "asc" },
      });

  const total = companies.length;
  const slice = companies.slice(offset, offset + limit);

  console.log(
    `[intelligence-summary] regen batch offset=${offset} size=${slice.length}/${total} force=${force}`,
  );

  for (const { id } of slice) {
    try {
      await generateCompanyIntelligenceSummary(id, { force });
    } catch (e) {
      console.error(
        `[intelligence-summary] failed for ${id}:`,
        e instanceof Error ? e.message : e,
      );
    }
  }

  const nextOffset = offset + slice.length;
  const done = nextOffset >= total;
  return {
    done,
    nextOffset: done ? null : nextOffset,
    processed: slice.length,
    total,
    force,
  };
}

/** Regenerate all (or selected) summaries — fine for 1 company; prefer batch for full portfolio. */
export async function regenerateCompanyIntelligenceSummaries(options?: {
  force?: boolean;
  companyIds?: string[];
}) {
  const force = options?.force === true;
  let offset = 0;
  for (;;) {
    const batch = await regenerateCompanyIntelligenceSummariesBatch({
      force,
      offset,
      companyIds: options?.companyIds,
    });
    if (batch.done || batch.nextOffset == null) break;
    offset = batch.nextOffset;
  }
}
