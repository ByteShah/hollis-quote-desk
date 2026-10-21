"use client";

import { useDeferredValue, useMemo, useState } from "react";
import { Search, SearchX } from "lucide-react";
import { formatGBP } from "@/lib/quote/money";
import { Badge, EmptyState, cn } from "@/components/ui";
import { RateStatusBadge } from "@/components/status";

export type RateRow = {
  code: string;
  item: string;
  unit: string;
  unit_raw: string | null;
  rate_ex_vat: number | null;
  status: string;
  notes: string | null;
  import_notes: string | null;
  modifiers: { id: string; label: string; amount: number; per: string }[];
};

const FILTERS = [
  { key: "all", label: "All" },
  { key: "active", label: "In use" },
  { key: "attention", label: "Needs attention" },
] as const;

const unitLabel = (u: string) => (u === "m2" ? "m²" : u === "m3" ? "m³" : u);

export function RatesTable({ rates }: { rates: RateRow[] }) {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["key"]>("all");
  const query = useDeferredValue(q.trim().toLowerCase());

  const rows = useMemo(
    () =>
      rates.filter((r) => {
        if (filter === "active" && r.status !== "active") return false;
        if (filter === "attention" && r.status === "active") return false;
        return !query || `${r.code} ${r.item} ${r.notes ?? ""}`.toLowerCase().includes(query);
      }),
    [rates, filter, query],
  );

  return (
    <div className="card overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 border-b border-line/70 px-4 py-3">
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-3 size-4 text-muted" aria-hidden />
          <input className="input pl-9" placeholder="Search code, item or note" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search rates" />
        </div>
        <div className="flex rounded-lg bg-sunken p-1 ring-1 ring-line">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={cn(
                "rounded-md px-3 py-1 text-[13px] transition",
                filter === f.key ? "bg-surface font-medium text-ink shadow-(--shadow-card)" : "text-muted hover:text-ink",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
        <span className="ml-auto text-xs text-muted num">
          {rows.length} of {rates.length}
        </span>
      </div>

      {rows.length === 0 ? (
        <EmptyState icon={SearchX} title="No matching rates">Try a different search or filter.</EmptyState>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px]">
            <thead>
              <tr>
                <th className="th w-20">Code</th>
                <th className="th">Item</th>
                <th className="th w-24">Unit</th>
                <th className="th w-28 text-right">Rate</th>
                <th className="th w-32">Status</th>
                <th className="th">Notes &amp; import decisions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.code} className={cn("transition hover:bg-sunken/40", r.status === "archived" && "text-muted")}>
                  <td className="td font-mono text-xs">{r.code}</td>
                  <td className="td">
                    <div className={cn(r.status === "archived" && "line-through decoration-line-strong")}>{r.item}</div>
                    {r.modifiers.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {r.modifiers.map((m) => (
                          <Badge key={m.id} tone="brand" className="text-[11px]">
                            + {m.label} {formatGBP(m.amount)}
                            {m.per === "unit" ? `/${unitLabel(r.unit)}` : ""}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="td">
                    {unitLabel(r.unit)}
                    {r.unit_raw && r.unit_raw !== r.unit && <div className="whitespace-nowrap text-[11px] text-muted">was “{r.unit_raw}”</div>}
                  </td>
                  <td className="td text-right font-medium num">{r.rate_ex_vat == null ? <span className="text-muted">-</span> : formatGBP(r.rate_ex_vat)}</td>
                  <td className="td"><RateStatusBadge status={r.status} /></td>
                  <td className="td max-w-md text-xs leading-relaxed">
                    {r.notes && <div className="text-ink-2">“{r.notes}”</div>}
                    {r.import_notes && <div className="mt-0.5 text-muted">{r.import_notes}</div>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
