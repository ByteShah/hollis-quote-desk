"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FileText, PlusCircle, Ruler, Settings, Users } from "lucide-react";
import { cn } from "./ui";

const ITEMS = [
  { href: "/app/quotes", label: "Quotes", icon: FileText, exact: false },
  { href: "/app/quotes/new", label: "New quote", icon: PlusCircle, exact: true },
  { href: "/app/rates", label: "Price list", icon: Ruler, exact: false },
  { href: "/app/customers", label: "Customers", icon: Users, exact: false },
  { href: "/app/settings", label: "Settings", icon: Settings, exact: false },
];

function isActive(path: string, href: string, exact: boolean) {
  if (exact) return path === href;
  if (href === "/app/quotes") return path === href || (path.startsWith("/app/quotes/") && path !== "/app/quotes/new");
  return path.startsWith(href);
}

export function SideNav() {
  const path = usePathname();
  return (
    <nav className="space-y-0.5" aria-label="Main">
      {ITEMS.map(({ href, label, icon: Icon, exact }) => {
        const active = isActive(path, href, exact);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "group flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition",
              active ? "bg-surface font-medium text-ink shadow-(--shadow-card) ring-1 ring-line" : "text-ink-2 hover:bg-surface/60 hover:text-ink",
            )}
          >
            <Icon className={cn("size-4", active ? "text-brand" : "text-muted group-hover:text-ink-2")} aria-hidden />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

export function MobileNav() {
  const path = usePathname();
  return (
    <nav className="-mx-4 flex gap-1 overflow-x-auto px-4 pb-2" aria-label="Main">
      {ITEMS.map(({ href, label, icon: Icon, exact }) => {
        const active = isActive(path, href, exact);
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px]",
              active ? "bg-brand text-white" : "bg-surface text-ink-2 ring-1 ring-line",
            )}
          >
            <Icon className="size-3.5" aria-hidden />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
