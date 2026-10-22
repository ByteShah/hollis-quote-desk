"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Trash2, TriangleAlert, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { MIN_CHARGE_CODE, priceLines, type QuoteLine } from "@/lib/quote/build";
import { formatGBP } from "@/lib/quote/money";
import { Badge, Button, cn } from "@/components/ui";
import { saveLines } from "../actions";

type RateOption = { code: string; item: string; unit: string; rate_ex_vat: number };

const unitLabel = (u: string) => (u === "m2" ? "m²" : u === "m3" ? "m³" : u);
const SOURCE: Record<string, { label: string; tone: "info" | "brand" | "neutral" }> = {
  ai: { label: "AI", tone: "info" },
  human: { label: "Edited", tone: "brand" },
  system: { label: "Auto", tone: "neutral" },
};

export function LinesEditor({
  quoteId,
  editable,
  initial,
  rates,
  pricing,
  saved,
  checks = {},
}: {
  quoteId: string;
  editable: boolean;
  initial: QuoteLine[];
  rates: RateOption[];
  pricing: { vat_rate: number; min_charge: number };
  saved: { subtotal: number; vat: number; total: number };
  /** Review notes per rate code, shown as a "Check" marker on the line. */
  checks?: Record<string, string[]>;
}) {
  const [lines, setLines] = useState(initial);
  const [dirty, setDirty] = useState(false);
  const [pending, start] = useTransition();
  const [addCode, setAddCode] = useState("");
  const router = useRouter();

  // Warn before leaving with unsaved edits.
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  // Live preview only; the server recalculates everything on save.
  const view = dirty ? priceLines(lines, pricing) : { lines, ...saved };

  // Edits index into view.lines (what's on screen). The minimum-charge line is
  // always last and never editable, and priceLines drops and re-adds it.
  const update = (i: number, patch: Partial<QuoteLine>) => {
    setLines(view.lines.map((l, j) => (j === i ? { ...l, ...patch, source: "human" as const } : l)));
    setDirty(true);
  };
  const remove = (i: number) => {
    setLines(view.lines.filter((_, j) => j !== i));
    setDirty(true);
  };
  const add = () => {
    const rate = rates.find((r) => r.code === addCode);
    const line: QuoteLine = rate
      ? { rate_code: rate.code, description: rate.item, qty: 1, unit: rate.unit, unit_rate: rate.rate_ex_vat, line_total: 0, source: "human", note: null }
      : { rate_code: null, description: "", qty: 1, unit: "each", unit_rate: 0, line_total: 0, source: "human", note: null };
    setLines([...view.lines.filter((l) => l.rate_code !== MIN_CHARGE_CODE), line]);
    setAddCode("");
    setDirty(true);
  };
  const reset = () => {
    setLines(initial);
    setDirty(false);
  };
  const save = () =>
    start(async () => {
      const res = await saveLines(quoteId, lines);
      if (res.error) return void toast.error(res.error);
      setLines(priceLines(lines, pricing).lines);
      setDirty(false);
      toast.success("Changes saved");
      router.refresh();
    });

  return (
    <div>
      <div className="-mx-5 -mt-5 overflow-x-auto">
        <table className="w-full min-w-[600px]">
          <thead>
            <tr>
              <th className="th">Item</th>
              <th className="th w-36 text-right">Qty</th>
              <th className="th w-32 text-right">Rate</th>
              <th className="th w-28 text-right">Amount</th>
              {editable && <th className="th w-10" />}
            </tr>
          </thead>
          <tbody>
            {view.lines.map((l, i) => {
              const system = l.rate_code === MIN_CHARGE_CODE;
              const canEdit = editable && !system;
              const src = SOURCE[l.source] ?? SOURCE.system;
              return (
                <tr key={i} className={cn("group", system && "bg-sunken/50")}>
                  <td className="td">
                    {canEdit ? (
                      <textarea
                        rows={1}
                        className="input h-auto min-h-9 resize-none py-1.5 leading-snug [field-sizing:content]"
                        value={l.description}
                        placeholder="Describe the item"
                        aria-label="Description"
                        onChange={(e) => update(i, { description: e.target.value })}
                      />
                    ) : (
                      <div className={cn("text-sm", system && "text-ink-2")}>{l.description}</div>
                    )}
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-muted">
                      <Badge tone={src.tone} className="text-[11px]">{src.label}</Badge>
                      {l.rate_code && !system && <span className="font-mono text-[11px]">{l.rate_code}</span>}
                      {l.rate_code && checks[l.rate_code] && (
                        <span
                          className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-800 ring-1 ring-amber-200"
                          title={checks[l.rate_code].join("\n")}
                        >
                          <TriangleAlert className="size-3" aria-hidden /> Check
                        </span>
                      )}
                      {l.note && <span className="line-clamp-1 min-w-0 max-w-md flex-1" title={l.note}>{l.note}</span>}
                    </div>
                  </td>
                  <td className="td text-right">
                    {canEdit ? (
                      <div className="relative">
                        <input
                          className="input h-9 pr-11 text-right num [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                          type="number"
                          inputMode="decimal"
                          step="0.01"
                          min="0"
                          aria-label={`Quantity in ${unitLabel(l.unit)}`}
                          value={l.qty}
                          onChange={(e) => update(i, { qty: Number(e.target.value) })}
                        />
                        <span className="pointer-events-none absolute right-2.5 top-2 text-[13px] text-muted">{unitLabel(l.unit)}</span>
                      </div>
                    ) : (
                      <span className="num whitespace-nowrap">
                        {l.qty} <span className="text-muted">{unitLabel(l.unit)}</span>
                      </span>
                    )}
                  </td>
                  <td className="td text-right">
                    {canEdit ? (
                      <div className="relative">
                        <span className="pointer-events-none absolute left-2.5 top-2 text-sm text-muted">£</span>
                        <MoneyInput
                          className="input h-9 pl-6 text-right num"
                          aria-label="Rate"
                          value={l.unit_rate}
                          onValue={(v) => update(i, { unit_rate: v })}
                        />
                      </div>
                    ) : (
                      <span className="num">{formatGBP(l.unit_rate)}</span>
                    )}
                  </td>
                  <td className="td text-right font-medium num">{formatGBP(l.line_total)}</td>
                  {editable && (
                    <td className="td">
                      {!system && (
                        <button
                          type="button"
                          onClick={() => remove(i)}
                          className="rounded-md p-1.5 text-muted opacity-60 transition hover:bg-red-50 hover:text-red-600 group-hover:opacity-100"
                          aria-label="Remove line"
                        >
                          <Trash2 className="size-4" />
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
            {view.lines.length === 0 && (
              <tr>
                <td className="td py-8 text-center text-muted" colSpan={editable ? 5 : 4}>
                  No priced lines{editable ? ". Add one from your price list below." : "."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex flex-col-reverse gap-5 sm:flex-row sm:items-start sm:justify-between">
        {editable ? (
          <div className="flex w-full max-w-md gap-2">
            <select className="input" value={addCode} onChange={(e) => setAddCode(e.target.value)} aria-label="Item to add">
              <option value="">Custom line</option>
              {rates.map((r) => (
                <option key={r.code} value={r.code}>
                  {r.code} · {r.item} ({formatGBP(r.rate_ex_vat)}/{unitLabel(r.unit)})
                </option>
              ))}
            </select>
            <Button type="button" variant="secondary" onClick={add}>
              <Plus className="size-4" /> Add
            </Button>
          </div>
        ) : (
          <div />
        )}
        <dl className="w-full space-y-1.5 text-sm sm:w-64">
          <div className="flex justify-between">
            <dt className="text-muted">Subtotal</dt>
            <dd className="num">{formatGBP(view.subtotal)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted">VAT {pricing.vat_rate * 100}%</dt>
            <dd className="num">{formatGBP(view.vat)}</dd>
          </div>
          <div className="flex justify-between border-t border-line pt-2 text-base font-semibold">
            <dt>Total</dt>
            <dd className="num">{formatGBP(view.total)}</dd>
          </div>
        </dl>
      </div>

      {editable && dirty && (
        <div className="sticky bottom-4 z-10 mt-5 flex items-center gap-3 rounded-xl border border-line bg-ink px-4 py-2.5 text-sm text-white shadow-(--shadow-pop) animate-rise">
          <span className="size-2 rounded-full bg-amber-400" />
          Unsaved changes. Totals shown are a preview.
          <div className="ml-auto flex gap-2">
            <button type="button" onClick={reset} disabled={pending} className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-white/80 hover:bg-white/10 hover:text-white">
              <Undo2 className="size-4" /> Discard
            </button>
            <button
              type="button"
              onClick={save}
              disabled={pending}
              className="flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 font-medium text-ink hover:bg-white/90 disabled:opacity-60"
            >
              {pending && <Loader2 className="size-4 animate-spin" />} Save changes
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * A price field that always shows pence (62.00, not 62). While someone is
 * typing it keeps their text as is; it's tidied to two decimals on blur.
 */
function MoneyInput({ value, onValue, ...rest }: { value: number; onValue: (v: number) => void; className?: string; "aria-label"?: string }) {
  const [text, setText] = useState<string | null>(null);
  return (
    <input
      {...rest}
      type="text"
      inputMode="decimal"
      value={text ?? value.toFixed(2)}
      onFocus={(e) => {
        setText(value.toFixed(2));
        e.currentTarget.select();
      }}
      onChange={(e) => {
        const t = e.target.value.replace(/[^0-9.]/g, "");
        setText(t);
        const n = Number(t);
        if (Number.isFinite(n) && n >= 0) onValue(Math.round(n * 100) / 100);
      }}
      onBlur={() => setText(null)}
    />
  );
}
