"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/components/ui";

export function SettingsTabs({ tabs }: { tabs: { href: string; label: string }[] }) {
  const path = usePathname();
  return (
    <nav className="mb-6 flex gap-1 overflow-x-auto border-b border-line" aria-label="Settings">
      {tabs.map((t) => {
        const active = t.href === "/app/settings" ? path === t.href : path.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "-mb-px shrink-0 border-b-2 px-3 py-2.5 text-sm transition",
              active ? "border-brand font-medium text-ink" : "border-transparent text-muted hover:text-ink",
            )}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
