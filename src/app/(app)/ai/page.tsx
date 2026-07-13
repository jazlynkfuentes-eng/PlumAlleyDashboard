"use client";

import { FormEvent, useState } from "react";
import { Send } from "lucide-react";

type Citation = {
  id: string;
  companyName: string;
  sourceType: string;
  sourceUrl: string;
};

type Message = {
  role: "user" | "assistant";
  content: string;
  citations?: Citation[];
};

export default function AiPage() {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content:
        "Ask questions like “What did Einride post this week?” or “Which companies published on LinkedIn today?” I draw only from stored LinkedIn company-page posts.",
    },
  ]);
  const [input, setInput] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const question = input.trim();
    if (!question || loading) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", content: question }]);
    setLoading(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, sessionId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Chat failed");
      setSessionId(data.sessionId);
      setMessages((m) => [
        ...m,
        { role: "assistant", content: data.answer, citations: data.citations },
      ]);
    } catch (err) {
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          content: err instanceof Error ? err.message : "Something went wrong.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex h-[calc(100vh)] flex-col px-8 py-8">
      <header className="mb-6 shrink-0">
        <p className="text-sm uppercase tracking-[0.14em] text-[var(--grey)]">AI Agent</p>
        <h1 className="mt-2 text-4xl font-black tracking-tight">Conversational Q&A</h1>
        <p className="mt-2 max-w-2xl text-[var(--grey)]">
          Answers cite official LinkedIn company-page posts stored in the dashboard.
        </p>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto border border-[var(--border)] px-5 py-4">
        <div className="mx-auto max-w-3xl space-y-5">
          {messages.map((m, i) => (
            <div key={i} className={m.role === "user" ? "text-right" : ""}>
              <div
                className={
                  m.role === "user"
                    ? "inline-block bg-[var(--black)] px-4 py-2 text-left text-[var(--white)]"
                    : "text-left leading-relaxed"
                }
              >
                <div className="whitespace-pre-wrap">{m.content}</div>
              </div>
              {m.citations && m.citations.length > 0 && (
                <ul className="mt-2 space-y-1 text-left text-sm text-[var(--grey)]">
                  {m.citations.slice(0, 8).map((c, idx) => (
                    <li key={c.id}>
                      [{idx + 1}] {c.companyName} · {c.sourceType} ·{" "}
                      <a href={c.sourceUrl} target="_blank" rel="noreferrer" className="underline">
                        source
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
          {loading && <p className="text-[var(--grey)]">Retrieving stored updates…</p>}
        </div>
      </div>

      <form onSubmit={onSubmit} className="mx-auto mt-4 flex w-full max-w-3xl gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about any portfolio company…"
          className="min-w-0 flex-1 border border-[var(--border-strong)] px-4 py-3 outline-none focus:border-[var(--black)]"
        />
        <button
          type="submit"
          disabled={loading}
          className="inline-flex items-center gap-2 bg-[var(--black)] px-5 text-[var(--white)] disabled:opacity-50"
        >
          <Send size={16} /> Ask
        </button>
      </form>
    </div>
  );
}
