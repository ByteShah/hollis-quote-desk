"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight, Loader2, Search, X } from "lucide-react";
import { cn } from "./ui";

// Shared list-view controls. All state lives in the URL, so a filtered view
// can be bookmarked or shared, and the server does the filtering and paging.

function useParamHref() {
  const params = useSearchParams();
  const pathname = usePathname();
  return (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v == null || v === "") next.delete(k);
      else next.set(k, v);
    }
    if (!("page" in patch)) next.delete("page");
    const qs = next.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  };
}

export function SearchBox({ placeholder }: { placeholder: string }) {
  const params = useSearchParams();
  const href = useParamHref();
  const router = useRouter();
  const [value, setValue] = useState(params.get("q") ?? "");
  const [pending, start] = useTransition();

  useEffect(() => {
    const current = params.get("q") ?? "";
    if (value === current) return;
    const t = setTimeout(() => start(() => router.replace(href({ q: value.trim() || null }), { scroll: false })), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <div className="relative w-full sm:max-w-xs">
      <Search className="pointer-events-none absolute left-3 top-3 size-4 text-muted" aria-hidden />
      <input
        className="input pl-9 pr-9"
        placeholder={placeholder}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        aria-label={placeholder}
        type="search"
      />
      {pending ? (
        <Loader2 className="absolute right-3 top-3 size-4 animate-spin text-muted" />
      ) : value ? (
        <button type="button" className="absolute right-2.5 top-2.5 rounded p-0.5 text-muted hover:text-ink" onClick={() => setValue("")} aria-label="Clear search">
          <X className="size-4" />
        </button>
      ) : null}
    </div>
  );
}

export function FilterTabs({ name, options, current }: { name: string; options: { value: string; label: string; count?: number }[]; current: string }) {
  const href = useParamHref();
  return (
    <div className="flex max-w-full overflow-x-auto rounded-lg bg-sunken p-1 ring-1 ring-line">
      {options.map((o) => (
        <Link
          key={o.value}
          href={href({ [name]: o.value === options[0].value ? null : o.value })}
          scroll={false}
          replace
          className={cn(
            "flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1 text-[13px] transition",
            current === o.value ? "bg-surface font-medium text-ink shadow-(--shadow-card)" : "text-muted hover:text-ink",
          )}
        >
          {o.label}
          {o.count != null && <span className="text-[11px] text-muted num">{o.count}</span>}
        </Link>
      ))}
    </div>
  );
}

export function SelectFilter({ name, label, options, current }: { name: string; label: string; options: string[]; current: string }) {
  const href = useParamHref();
  const router = useRouter();
  return (
    <select
      className="input h-9 w-auto max-w-[14rem] text-[13px]"
      aria-label={label}
      value={current}
      onChange={(e) => router.replace(href({ [name]: e.target.value || null }), { scroll: false })}
    >
      <option value="">{label}</option>
      {options.map((o) => (
        <option key={o} value={o}>{o}</option>
      ))}
    </select>
  );
}

export function Pager({ page, pageSize, total }: { page: number; pageSize: number; total: number }) {
  const href = useParamHref();
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <div className="flex items-center justify-between gap-3 border-t border-line/70 px-4 py-2.5 text-[13px] text-muted">
      <span className="num">{total === 0 ? "No records" : `${from}–${to} of ${total}`}</span>
      {pages > 1 && (
        <div className="flex items-center gap-1">
          <PageLink disabled={page <= 1} href={href({ page: String(page - 1) })} label="Previous page">
            <ChevronLeft className="size-4" />
          </PageLink>
          <span className="px-2 num">{page} / {pages}</span>
          <PageLink disabled={page >= pages} href={href({ page: String(page + 1) })} label="Next page">
            <ChevronRight className="size-4" />
          </PageLink>
        </div>
      )}
    </div>
  );
}

function PageLink({ disabled, href, label, children }: { disabled: boolean; href: string; label: string; children: React.ReactNode }) {
  if (disabled) return <span className="rounded-md p-1.5 opacity-40" aria-hidden>{children}</span>;
  return (
    <Link href={href} scroll={false} className="rounded-md p-1.5 hover:bg-sunken hover:text-ink" aria-label={label}>
      {children}
    </Link>
  );
}
