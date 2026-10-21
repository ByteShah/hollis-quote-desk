import Papa from "papaparse";
import { normaliseUnit, type CanonicalUnit } from "@/lib/quote/units";
import type { Rate, RateModifier } from "@/lib/quote/build";

// Rate-sheet import: a generic cleaner for the mechanical problems (units,
// "£1,250", TBC, BOM, "inc VAT", "old price"), plus an explicit per-company
// decisions file for the judgement calls a human should sign off.

export type RateDecision = {
  status?: Rate["status"];
  rate_ex_vat?: number | null;
  unit?: CanonicalUnit;
  modifiers?: RateModifier[];
  reason: string;
};

export type ImportedRate = Rate & {
  unit_raw: string;
  import_notes: string[];
  source_row: Record<string, string>;
};

export function parsePrice(raw: string): number | null {
  const cleaned = raw.replace(/[£,\s]/g, "");
  if (!cleaned || /^(tbc|tba|poa|n\/a|-)$/i.test(cleaned)) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export function parseRatesCsv(
  text: string,
  opts: { vatRate: number; decisions?: Record<string, RateDecision> },
): ImportedRate[] {
  const parsed = Papa.parse<Record<string, string>>(text.replace(/^﻿/, ""), {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim().toLowerCase(),
  });

  const out: ImportedRate[] = [];
  for (const row of parsed.data) {
    const code = (row.code ?? "").trim().toUpperCase();
    if (!code) continue;
    const notes = (row.notes ?? "").trim();
    const importNotes: string[] = [];

    const unitRaw = (row.unit ?? "").trim();
    let unit = normaliseUnit(unitRaw);
    if (!unit) {
      importNotes.push(`Unknown unit "${unitRaw}"; treated as "each".`);
      unit = "each";
    } else if (unit !== unitRaw) {
      importNotes.push(`Unit "${unitRaw}" normalised to "${unit}".`);
    }

    let price = parsePrice(row.rate ?? "");
    let status: Rate["status"] = "active";
    if (price == null) {
      status = "price_on_request";
      importNotes.push(`No usable price ("${row.rate}").`);
    } else if (/[£,]/.test(row.rate ?? "")) {
      importNotes.push(`Price "${row.rate}" parsed as ${price}.`);
    }

    if (price != null && /\binc(l|luding)?\.?\s*vat\b/i.test(notes)) {
      const ex = Math.round((price / (1 + opts.vatRate)) * 100) / 100;
      importNotes.push(`Note says price includes VAT: ${price} → ${ex} ex VAT.`);
      price = ex;
    }
    if (/\bold\b/i.test(notes)) {
      status = "archived";
      importNotes.push(`Marked archived as an old price (note: "${notes}").`);
    }
    if (/we don'?t do/i.test(notes)) {
      status = "not_offered";
      importNotes.push(`Marked not offered (note: "${notes}").`);
    }

    const rate: ImportedRate = {
      code,
      item: (row.item ?? "").trim(),
      unit,
      unit_raw: unitRaw,
      rate_ex_vat: price,
      status,
      notes: notes || null,
      modifiers: [],
      import_notes: importNotes,
      source_row: row,
    };

    const d = opts.decisions?.[code];
    if (d) {
      if (d.status) rate.status = d.status;
      if (d.rate_ex_vat !== undefined) rate.rate_ex_vat = d.rate_ex_vat;
      if (d.unit) rate.unit = d.unit;
      if (d.modifiers) rate.modifiers = d.modifiers;
      rate.import_notes.push(`Decision: ${d.reason}`);
    }
    if (rate.status === "active" && rate.rate_ex_vat == null) rate.status = "price_on_request";
    out.push(rate);
  }
  return out;
}
