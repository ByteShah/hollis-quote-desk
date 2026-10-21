"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarClock, CheckCheck, ChevronRight, Clock3, Loader2, SearchX } from "lucide-react";
import { toast } from "sonner";
import { formatGBP } from "@/lib/quote/money";
import { unitLabel } from "@/lib/rates";
import { Badge, EmptyState, buttonClass, cn } from "@/components/ui";
import { RateStatusBadge } from "@/components/status";
import { markReviewed } from "./actions";
import { formatDate } from "@/lib/dates";

export type RateRow = {
  id: string;
  code: string;
  item: string;
  category: string | null;
  unit: string;
  rate_ex_vat: number | null;
  next_price: number | null;
  next_price_from: string | null;
  status: string;
  notes: string | null;
  modifiers: { id: string; label: string; amount: number; per: string }[];
  needs_review: boolean;
  last_reviewed_at: string | null;
};

const shortDate = (d: string) => formatDate(d);

export function RatesTable({
  rates,
  editable,
  reviewMonths,
  emptyHint,
}: {
  rates: RateRow[];
  editable: boolean;
  reviewMonths: number;
  emptyHint: "filters" | "none";
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, start] = useTransition();
  const router = useRouter();

  if (rates.length === 0) {
    return emptyHint === "filters" ? (
      <EmptyState icon={SearchX} title="No items match">Try a different search or filter.</EmptyState>
    ) : (
      <EmptyState icon={SearchX} title="Your price list is empty">Add items one by one, or import a CSV.</EmptyState>
    );
  }

  const groups = new Map<string, RateRow[]>();
  for (const r of rates) {
    const k = r.category ?? "Uncategorised";
    groups.set(k, [...(groups.get(k) ?? []), r]);
  }
  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const reviewable = rates.filter((r) => r.status === "active");
  const allSelected = reviewable.length > 0 && reviewable.every((r) => selected.has(r.id));

  const review = () =>
    start(async () => {
      const res = await markReviewed([...selected]);
      if (!res.ok) return void toast.error(res.error);
      toast.success(`${res.count} price${res.count === 1 ? "" : "s"} marked as reviewed`);
      setSelected(new Set());
      router.refresh();
    });

  return (
    <div>
      {editable && selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-3 border-b border-line/70 bg-brand-soft/50 px-4 py-2 text-[13px]">
          <span className="font-medium">{selected.size} selected</span>
          <button type="button" onClick={review} disabled={pending} className={buttonClass("secondary", "sm")}>
            {pending ? <Loader2 className="size-3.5 animate-spin" /> : <CheckCheck className="size-3.5" />} Mark prices as reviewed
          </button>
          <button type="button" onClick={() => setSelected(new Set())} className="text-muted hover:text-ink">Clear</button>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px]">
          <thead>
            <tr>
              {editable && (
                <th className="th w-10">
                  <input
                    type="checkbox"
                    aria-label="Select all items in use"
                    checked={allSelected}
                    onChange={() => setSelected(allSelected ? new Set() : new Set(reviewable.map((r) => r.id)))}
                    className="accent-(--color-brand)"
                  />
                </th>
              )}
              <th className="th w-24">Code</th>
              <th className="th">Item</th>
              <th className="th w-36 text-right">Price (ex VAT)</th>
              <th className="th w-32">Status</th>
              <th className="th w-8" />
            </tr>
          </thead>
          {[...groups.entries()].map(([category, rows]) => (
            <tbody key={category}>
              <tr>
                <td colSpan={editable ? 6 : 5} className="border-b border-line/70 bg-canvas/60 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">
                  {category} <span className="font-normal num">· {rows.length}</span>
                </td>
              </tr>
              {rows.map((r) => (
                <tr key={r.id} className={cn("group relative transition hover:bg-sunken/40", r.status === "archived" && "text-muted")}>
                  {editable && (
                    <td className="td relative z-10">
                      {r.status === "active" && (
                        <input
                          type="checkbox"
                          aria-label={`Select ${r.code}`}
                          checked={selected.has(r.id)}
                          onChange={() => toggle(r.id)}
                          className="accent-(--color-brand)"
                        />
                      )}
                    </td>
                  )}
                  <td className="td font-mono text-xs">
                    <Link href={`/app/rates/${r.id}`} className="rounded outline-none after:absolute after:inset-0 focus-visible:ring-2 focus-visible:ring-brand" aria-label={`Open ${r.code}`}>
                      {r.code}
                    </Link>
                  </td>
                  <td className="td">
                    <div className={cn("font-medium text-ink", r.status === "archived" && "font-normal text-muted line-through decoration-line-strong")}>{r.item}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      {r.modifiers.map((m) => (
                        <Badge key={m.id} tone="brand" className="text-[11px]">
                          + {m.label} {formatGBP(m.amount)}{m.per === "unit" ? `/${unitLabel(r.unit)}` : ""}
                        </Badge>
                      ))}
                      {r.needs_review && (
                        <Badge tone="warning" className="text-[11px]">
                          <Clock3 className="size-3" /> Not reviewed in {reviewMonths}+ months
                        </Badge>
                      )}
                      {r.notes && <span className="line-clamp-1 max-w-md text-xs text-muted">{r.notes}</span>}
                    </div>
                  </td>
                  <td className="td text-right">
                    {r.rate_ex_vat == null ? (
                      <span className="text-muted">-</span>
                    ) : (
                      <span className="font-medium num">
                        {formatGBP(r.rate_ex_vat)}
                        <span className="font-normal text-muted"> /{unitLabel(r.unit)}</span>
                      </span>
                    )}
                    {r.next_price != null && r.next_price_from && (
                      <div className="mt-0.5 flex items-center justify-end gap-1 text-[11px] text-sky-700">
                        <CalendarClock className="size-3" /> {formatGBP(r.next_price)} from {shortDate(r.next_price_from)}
                      </div>
                    )}
                  </td>
                  <td className="td"><RateStatusBadge status={r.status} /></td>
                  <td className="td text-muted"><ChevronRight className="size-4 transition group-hover:translate-x-0.5 group-hover:text-ink" /></td>
                </tr>
              ))}
            </tbody>
          ))}
        </table>
      </div>
    </div>
  );
}
