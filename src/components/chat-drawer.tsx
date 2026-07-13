"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { X, Send } from "lucide-react";
import { cn } from "@/lib/utils";

type Citation = {
  id: string;
  companyName: string;
  sourceType: string;
  sourceUrl: string;
  title: string | null;
  excerpt: string;
};

type Message = {
  role: "user" | "assistant";
  content: string;
  citations?: Citation[];
};

export function ChatDrawer({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content:
        "Ask about any portfolio company. I answer from stored LinkedIn company-page posts only.",
    },
  ]);
  const [input, setInput] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, open]);

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
        {
          role: "assistant",
          content: data.answer,
          citations: data.citations,
        },
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
    <>
      <div
        className={cn(
          "fixed inset-0 z-40 bg-black/20 transition-opacity",
          open ? "opacity-100" : "pointer-events-none opacity-0",
        )}
        onClick={onClose}
      />
      <aside
        className={cn(
          "fixed top-0 right-0 z-50 flex h-full w-full max-w-md flex-col border-l border-[var(--border-strong)] bg-[var(--white)] transition-transform duration-300",
          open ? "translate-x-0" : "translate-x-full",
        )}
      >
        <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-4">
          <div>
            <h2 className="text-lg font-bold">AI Agent</h2>
            <p className="text-sm text-[var(--grey)]">Official sources only</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-sm p-2 hover:bg-[var(--muted-bg)]"
            aria-label="Close chat"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {messages.map((m, i) => (
            <div
              key={i}
              className={cn(
                "max-w-[95%] text-[15px] leading-relaxed",
                m.role === "user"
                  ? "ml-auto bg-[var(--black)] px-3 py-2 text-[var(--white)]"
                  : "text-[var(--black)]",
              )}
            >
              <div className="whitespace-pre-wrap">{m.content}</div>
              {m.citations && m.citations.length > 0 && (
                <ul className="mt-3 space-y-1 border-t border-[var(--border)] pt-2 text-xs text-[var(--grey)]">
                  {m.citations.slice(0, 6).map((c, idx) => (
                    <li key={c.id}>
                      [{idx + 1}] {c.companyName} · {c.sourceType} ·{" "}
                      <a
                        href={c.sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="underline"
                      >
                        source
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
          {loading && (
            <p className="text-sm text-[var(--grey)]">Thinking from stored updates…</p>
          )}
          <div ref={bottomRef} />
        </div>

        <form onSubmit={onSubmit} className="border-t border-[var(--border)] p-4">
          <div className="flex gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="What did Einride post this week?"
              className="min-w-0 flex-1 border border-[var(--border-strong)] bg-[var(--white)] px-3 py-2.5 outline-none focus:border-[var(--black)]"
            />
            <button
              type="submit"
              disabled={loading}
              className="bg-[var(--black)] px-3 text-[var(--white)] disabled:opacity-50"
              aria-label="Send"
            >
              <Send size={16} />
            </button>
          </div>
        </form>
      </aside>
    </>
  );
}
