"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Grid2X2,
  Bot,
  Settings,
  PanelRightOpen,
} from "lucide-react";
import { PlumAlleyLogo } from "@/components/plum-alley-logo";
import { cn } from "@/lib/utils";

const nav = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/portfolio", label: "Portfolio Grid", icon: Grid2X2 },
  { href: "/ai", label: "AI Agent", icon: Bot },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Sidebar({ onOpenChat }: { onOpenChat?: () => void }) {
  const pathname = usePathname();

  return (
    <aside className="flex h-full w-[240px] shrink-0 flex-col border-r border-[var(--border)] bg-[var(--white)]">
      <div className="border-b border-[var(--border)] px-5 py-6">
        <Link href="/" className="block">
          <PlumAlleyLogo size="sm" />
        </Link>
        <p className="mt-2 text-sm text-[var(--grey)]">Portfolio Intel</p>
      </div>

      <nav className="flex flex-1 flex-col gap-1 p-3">
        {nav.map((item) => {
          const active =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-sm px-3 py-2.5 text-[15px] transition-colors",
                active
                  ? "bg-[var(--black)] text-[var(--white)]"
                  : "text-[var(--black)] hover:bg-[var(--muted-bg)]",
              )}
            >
              <Icon size={18} strokeWidth={1.75} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-[var(--border)] p-3">
        <button
          type="button"
          onClick={onOpenChat}
          className="flex w-full items-center gap-3 rounded-sm border border-[var(--border-strong)] px-3 py-2.5 text-left text-[15px] transition-colors hover:bg-[var(--muted-bg)]"
        >
          <PanelRightOpen size={18} strokeWidth={1.75} />
          Ask AI
        </button>
      </div>
    </aside>
  );
}
