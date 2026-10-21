"use client";

import { useState, useTransition } from "react";
import { MIN_CHARGE_CODE, priceLines, type QuoteLine } from "@/lib/quote/build";
import { formatGBP } from "@/lib/quote/money";
import { saveLines } from "../actions";

type RateOption = { code: string; item: string; unit: string; rate_ex_vat: number };

export function LinesEditor({
  quoteId,
  editable,
  initial,
  rates,
  pricing,
  saved,
}: {
  quoteId: string;
  editable: boolean;
  initial: QuoteLine[];
  rates: RateOption[];
  pricing: { vat_rate: number; min_charge: number };
  saved: { subtotal: number; vat: number; total: number };
}) {
  const [lines, setLines] = useState(initial);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [addCode, setAddCode] = useState("");

  // Preview only; the server recalculates on save.
  const preview = dirty ? priceLines(lines, pricing) : { lines, ...saved };

  const update = (i: number, patch: Partial<QuoteLine>) => {
    setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch, source: "human" } : l)));
    setDirty(true);
  };
  const remove = (i: number) => {
    setLines((ls) => ls.filter((_, j) => j !== i));
    setDirty(true);
  };
  const add = () => {
    const rate = rates.find((r) => r.code === addCode);
    const line: QuoteLine = rate
      ? { rate_code: rate.code, description: rate.item, qty: 1, unit: rate.unit, unit_rate: rate.rate_ex_vat, line_total: 0, source: "human", note: null }
      : { rate_code: null, description: "Custom item", qty: 1, unit: "each", unit_rate: 0, line_total: 0, source: "human", note: null };
    setLines((ls) => [...ls.filter((l) => l.rate_code !== MIN_CHARGE_CODE), line]);
    setDirty(true);
  };
  const save = () =>
    start(async () => {
      setError(null);
      const res = await saveLines(quoteId, lines);
      if (res.error) setError(res.error);
      else {
        setLines(priceLines(lines, pricing).lines);
        setDirty(false);
      }
    });

  const shown = dirty ? preview.lines : lines;

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px]">
          <thead>
            <tr>
              <th className="th">Item</th>
              <th className="th w-24 text-right">Qty</th>
              <th className="th w-16">Unit</th>
              <th className="th w-28 text-right">Rate</th>
              <th className="th w-28 text-right">Total</th>
              {editable && <th className="th w-8" />}
            </tr>
          </thead>
          <tbody>
            {shown.map((l, i) => {
              const system = l.rate_code === MIN_CHARGE_CODE;
              const canEdit = editable && !system;
              return (
                <tr key={i} className={system ? "bg-stone-50" : ""}>
                  <td className="td">
                    {canEdit ? (
                      <input className="input py-1" value={l.description} onChange={(e) => update(i, { description: e.target.value })} />
                    ) : (
                      l.description
                    )}
                    <div className="mt-0.5 text-xs text-stone-400">
                      {l.rate_code && !system && <span className="font-mono">{l.rate_code} · </span>}
                      {l.source === "ai" ? "AI" : l.source === "human" ? "edited" : "auto"}
                      {l.note && ` · ${l.note}`}
                    </div>
                  </td>
                  <td className="td text-right">
                    {canEdit ? (
                      <input
                        className="input py-1 text-right"
                        type="number"
                        step="0.01"
                        min="0"
                        value={l.qty}
                        onChange={(e) => update(i, { qty: Number(e.target.value) })}
                      />
                    ) : (
                      l.qty
                    )}
                  </td>
                  <td className="td">{l.unit}</td>
                  <td className="td text-right">
                    {canEdit ? (
                      <input
                        className="input py-1 text-right"
                        type="number"
                        step="0.01"
                        min="0"
                        value={l.unit_rate}
                        onChange={(e) => update(i, { unit_rate: Number(e.target.value) })}
                      />
                    ) : (
                      formatGBP(l.unit_rate)
                    )}
                  </td>
                  <td className="td text-right tabular-nums">{formatGBP(l.line_total)}</td>
                  {editable && (
                    <td className="td">
                      {!system && (
                        <button type="button" onClick={() => remove(i)} className="text-stone-400 hover:text-red-600" aria-label="Remove line">
                          ✕
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
            {shown.length === 0 && (
              <tr>
                <td className="td text-stone-500" colSpan={6}>No priced lines.</td>
              </tr>
            )}
          </tbody>
          <tfoot className="text-sm">
            <tr>
              <td colSpan={4} className="px-3 pt-3 text-right">Subtotal (ex VAT)</td>
              <td className="px-3 pt-3 text-right tabular-nums">{formatGBP(preview.subtotal)}</td>
            </tr>
            <tr>
              <td colSpan={4} className="px-3 text-right">VAT {pricing.vat_rate * 100}%</td>
              <td className="px-3 text-right tabular-nums">{formatGBP(preview.vat)}</td>
            </tr>
            <tr className="font-semibold">
              <td colSpan={4} className="px-3 text-right">Total</td>
              <td className="px-3 text-right tabular-nums">{formatGBP(preview.total)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {editable && (
        <div className="no-print flex flex-wrap items-center gap-2 border-t border-stone-100 pt-3">
          <select className="input w-auto max-w-xs py-1.5" value={addCode} onChange={(e) => setAddCode(e.target.value)}>
            <option value="">Custom line…</option>
            {rates.map((r) => (
              <option key={r.code} value={r.code}>
                {r.code}: {r.item} ({formatGBP(r.rate_ex_vat)}/{r.unit})
              </option>
            ))}
          </select>
          <button type="button" className="btn-secondary" onClick={add}>Add line</button>
          <div className="ml-auto flex items-center gap-3">
            {dirty && <span className="text-xs text-amber-700">Unsaved changes</span>}
            {error && <span className="text-xs text-red-700">{error}</span>}
            <button type="button" className="btn-primary" disabled={!dirty || pending} onClick={save}>
              {pending ? "Saving…" : "Save changes"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
