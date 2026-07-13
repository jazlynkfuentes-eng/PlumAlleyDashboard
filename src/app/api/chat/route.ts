import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { answerPortfolioQuestion } from "@/lib/ai";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const question = String(body.question ?? "").trim();
  if (!question) {
    return NextResponse.json({ error: "Question required" }, { status: 400 });
  }

  try {
    const result = await answerPortfolioQuestion(question, body.sessionId ?? null);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Chat failed" },
      { status: 500 },
    );
  }
}
