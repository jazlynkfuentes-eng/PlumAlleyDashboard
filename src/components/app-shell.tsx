"use client";

import { useState } from "react";
import { Sidebar } from "@/components/sidebar";
import { ChatDrawer } from "@/components/chat-drawer";

export function AppShell({ children }: { children: React.ReactNode }) {
  const [chatOpen, setChatOpen] = useState(false);

  return (
    <div className="flex min-h-screen bg-[var(--bg-primary)] text-[var(--black)]">
      <Sidebar onOpenChat={() => setChatOpen(true)} />
      <main className="min-w-0 flex-1 overflow-x-hidden bg-[var(--bg-primary)]">{children}</main>
      <ChatDrawer open={chatOpen} onClose={() => setChatOpen(false)} />
    </div>
  );
}
