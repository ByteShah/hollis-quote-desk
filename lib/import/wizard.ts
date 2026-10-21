import Papa from "papaparse";
import { normaliseUnit, type CanonicalUnit } from "@/lib/quote/units";
import { parsePrice } from "./rates";
import { categoryFor } from "./categories";
import { applyHouseRules, type RuleRow } from "./house-rules";
import { ukToday } from "@/lib/rates";
import { dedupeRows, normEmail, normPhone, type ImportedCustomer } from "./customers";

// The CSV import engine: read a file, match its columns to our fields, clean
// each row with the same rules used on Shaz's sheet, and compare it with what
// the company already has. Pure functions: the server runs them for the
// preview and again on apply, so nothing from the browser is trusted.

import { FIELDS, MAX_ROWS, type Kind, type Mapping } from "./fields";
export { FIELDS, MAX_BYTES, MAX_ROWS, type FieldDef, type Kind, type Mapping } from "./fields";

export type Table = { headers: string[]; rows: string[][] };

export function readCsv(text: string): Table {
  const parsed = Papa.parse<string[]>(text.replace(/^﻿/, ""), { skipEmptyLines: "greedy" });
  const [headers = [], ...rows] = parsed.data;
  return {
    headers: headers.map((h) => (h ?? "").trim()),
    rows: rows.map((r) => headers.map((_, i) => (r[i] ?? "").trim())),
  };
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9£]+/g, " ").trim();

export function suggestMapping(kind: Kind, headers: string[]): Mapping {
  const used = new Set<number>();
  const mapping: Mapping = {};
  for (const f of FIELDS[kind]) {
    const idx = headers.findIndex((h, i) => !used.has(i) && f.synonyms.includes(norm(h)));
    mapping[f.key] = idx >= 0 ? idx : null;
    if (idx >= 0) used.add(idx);
  }
  return mapping;
}

export function missingRequired(kind: Kind, mapping: Mapping): string[] {
  return FIELDS[kind].filter((f) => f.required && mapping[f.key] == null).map((f) => f.label);
}

const cell = (row: string[], mapping: Mapping, key: string) => {
  const i = mapping[key];
  return i == null ? "" : (row[i] ?? "").trim();
};

// ---------------------------------------------------------------------------
// Rates
// ---------------------------------------------------------------------------

export type RateStatus = "active" | "price_on_request" | "not_offered" | "archived";

export type CleanRate = {
  code: string;
  item: string;
  unit: CanonicalUnit;
  unit_raw: string;
  category: string | null;
  status: RateStatus;
  notes: string | null;
  price: number | null;
  effective_from: string | null;
  import_notes: string;
  modifiers: { id: string; label: string; amount: number; per: "unit" | "flat" }[];
};

export type ExistingRate = {
  code: string;
  item: string;
  unit: string;
  category: string | null;
  status: string;
  notes: string | null;
  rate_ex_vat: number | null;
};

export type PreviewRow = {
  line: number;
  action: "create" | "update" | "unchanged" | "error";
  key: string;
  label: string;
  changes: string[];
  errors: string[];
  warnings: string[];
};

function parseStatus(raw: string): RateStatus | null {
  const s = raw.toLowerCase().trim();
  if (!s) return null;
  if (["active", "in use", "yes", "y", "true", "1", "live"].includes(s)) return "active";
  if (["archived", "archive", "inactive", "no", "n", "false", "0", "old", "superseded", "discontinued"].includes(s)) return "archived";
  if (["price on request", "por", "tbc", "no price", "price_on_request"].includes(s)) return "price_on_request";
  if (["not offered", "not_offered", "don't do", "dont do", "not done"].includes(s)) return "not_offered";
  return null;
}

function parseDate(raw: string): string | null | "invalid" {
  if (!raw) return null;
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const uk = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  const [y, m, d] = iso ? [iso[1], iso[2], iso[3]] : uk ? [uk[3], uk[2].padStart(2, "0"), uk[1].padStart(2, "0")] : [];
  if (!y) return "invalid";
  const date = new Date(`${y}-${m}-${d}T00:00:00Z`);
  return Number.isNaN(date.getTime()) || date.getUTCDate() !== Number(d) ? "invalid" : `${y}-${m}-${d}`;
}

export function cleanRateRow(
  row: string[],
  mapping: Mapping,
  vatRate: number,
): { value?: CleanRate; errors: string[]; warnings: string[]; explicitStatus: boolean } {
  const errors: string[] = [];
  const warnings: string[] = [];
  const notesIn: string[] = [];
  const code = cell(row, mapping, "code").toUpperCase();
  const item = cell(row, mapping, "item");
  const unitRaw = cell(row, mapping, "unit");
  const priceRaw = cell(row, mapping, "price");
  const notes = cell(row, mapping, "notes");

  if (!code) errors.push("Missing code.");
  else if (!/^[A-Z0-9][A-Z0-9_-]{0,19}$/.test(code)) errors.push(`Code "${code}" can only use letters, numbers, - and _ (max 20).`);
  if (!item) errors.push("Missing item name.");
  else if (item.length > 200) errors.push("Item name is over 200 characters.");
  const unit = unitRaw ? normaliseUnit(unitRaw) : null;
  if (!unitRaw) errors.push("Missing unit.");
  else if (!unit) errors.push(`Unknown unit "${unitRaw}". Use m2, m, m3, each, job, day, load or tonne.`);
  else if (unit !== unitRaw.toLowerCase()) notesIn.push(`Unit "${unitRaw}" read as ${unit}.`);

  let price = priceRaw ? parsePrice(priceRaw) : null;
  if (priceRaw && price == null && !/^(tbc|tba|poa|n\/a|-)$/i.test(priceRaw.replace(/[£\s]/g, ""))) {
    errors.push(`Price "${priceRaw}" isn't a number.`);
  }
  if (priceRaw && /[£,]/.test(priceRaw) && price != null) notesIn.push(`Price "${priceRaw}" read as ${price}.`);
  if (price != null && /\binc(l|luding)?\.?\s*vat\b/i.test(notes)) {
    const ex = Math.round((price / (1 + vatRate)) * 100) / 100;
    warnings.push(`Note says the price includes VAT: £${price} stored as £${ex} ex VAT.`);
    price = ex;
  }

  let status = parseStatus(cell(row, mapping, "status"));
  const explicitStatus = status != null;
  if (cell(row, mapping, "status") && !status) warnings.push(`Status "${cell(row, mapping, "status")}" not recognised; using the default.`);
  if (!status) {
    if (/we don'?t do/i.test(notes)) status = "not_offered";
    else if (/\bold\b/i.test(notes)) status = "archived";
    else status = price == null ? "price_on_request" : "active";
    if (status !== "active") warnings.push(`Set to "${status.replace(/_/g, " ")}" from the note or missing price.`);
  }
  if (status === "active" && price == null) {
    status = "price_on_request";
    warnings.push("No price, so it won't be offered to the AI until one is set.");
  }

  const eff = parseDate(cell(row, mapping, "effective_from"));
  if (eff === "invalid") errors.push(`Date "${cell(row, mapping, "effective_from")}" isn't a valid date (use 2027-03-01 or 01/03/2027).`);

  if (errors.length) return { errors, warnings, explicitStatus };
  return {
    errors,
    warnings,
    explicitStatus,
    value: {
      code,
      item,
      unit: unit!,
      unit_raw: unitRaw,
      category: cell(row, mapping, "category") || categoryFor(code, item),
      status,
      notes: notes || null,
      price,
      effective_from: eff === "invalid" ? null : eff,
      import_notes: notesIn.join(" "),
      modifiers: [],
    },
  };
}

export type RatePlan = { preview: PreviewRow[]; items: (CleanRate & { action: "create" | "update" })[] };

export function planRates(table: Table, mapping: Mapping, existing: ExistingRate[], vatRate: number): RatePlan {
  const byCode = new Map(existing.map((e) => [e.code, e]));
  const seen = new Set<string>();
  const preview: PreviewRow[] = [];
  const items: RatePlan["items"] = [];

  // Pass 1: clean every row. Pass 2: apply the house rules across the whole
  // file (duplicates need to see every row). Pass 3: compare with what exists.
  const cleaned = table.rows.slice(0, MAX_ROWS).map((row, i) => {
    const line = i + 2; // header is line 1
    const r = cleanRateRow(row, mapping, vatRate);
    const key = r.value?.code ?? cell(row, mapping, "code").toUpperCase();
    if (r.value && seen.has(r.value.code)) r.errors.push(`Code ${r.value.code} appears more than once in this file.`);
    if (r.value) seen.add(r.value.code);
    return { ...r, line, key, row };
  });
  // Rules only apply to new items: existing ones were already decided by a person.
  applyHouseRules(
    cleaned.filter((c) => c.value && !c.errors.length && !byCode.has(c.value.code)) as unknown as RuleRow[],
  );

  cleaned.forEach(({ value, errors, warnings, line, key, row, explicitStatus }) => {
    if (!value || errors.length) {
      preview.push({ line, action: "error", key: key || "?", label: cell(row, mapping, "item"), changes: [], errors, warnings });
      return;
    }
    const cur = byCode.get(value.code);
    if (!cur) {
      preview.push({ line, action: "create", key: value.code, label: value.item, changes: [], errors, warnings });
      items.push({ ...value, action: "create" });
      return;
    }
    // A person already decided this item's status; only an explicit Status
    // column in the file changes it.
    if (!explicitStatus) value.status = cur.status as RateStatus;
    const changes: string[] = [];
    if (cur.item !== value.item) changes.push(`Name: ${cur.item} → ${value.item}`);
    if (cur.unit !== value.unit) changes.push(`Unit: ${cur.unit} → ${value.unit}`);
    if (mapping.category != null && (cur.category ?? "") !== (value.category ?? "")) changes.push(`Category: ${cur.category ?? "none"} → ${value.category ?? "none"}`);
    if (cur.status !== value.status) changes.push(`Status: ${cur.status.replace(/_/g, " ")} → ${value.status.replace(/_/g, " ")}`);
    if (mapping.notes != null && (cur.notes ?? "") !== (value.notes ?? "")) changes.push("Notes changed");
    const today = ukToday();
    const priceChanged = value.price != null && (cur.rate_ex_vat == null || Number(cur.rate_ex_vat) !== value.price);
    const scheduled = value.price != null && value.effective_from != null && value.effective_from > today;
    if (priceChanged || scheduled) {
      changes.push(
        `Price: ${cur.rate_ex_vat == null ? "none" : `£${Number(cur.rate_ex_vat).toFixed(2)}`} → £${value.price!.toFixed(2)}${value.effective_from ? ` from ${value.effective_from}` : ""}`,
      );
    }
    if (!changes.length) {
      preview.push({ line, action: "unchanged", key: value.code, label: value.item, changes, errors, warnings });
      return;
    }
    preview.push({ line, action: "update", key: value.code, label: value.item, changes, errors, warnings });
    items.push({
      ...value,
      // Columns that weren't mapped keep their current values.
      category: mapping.category != null ? value.category : null,
      notes: mapping.notes != null ? value.notes : null,
      action: "update",
    });
  });
  return { preview, items };
}

// ---------------------------------------------------------------------------
// Customers
// ---------------------------------------------------------------------------

export type ExistingCustomer = {
  id: string;
  name: string;
  company_name: string | null;
  emails: string[];
  phones: string[];
  address: string | null;
  postcode: string | null;
  notes: string | null;
  invoice_email: string | null;
  payment_terms: string | null;
  tags: string[];
};

type CustomerValues = Omit<ExistingCustomer, "id">;

export type CustomerPlan = {
  preview: PreviewRow[];
  items: { action: "create" | "update"; id?: string; values: Partial<CustomerValues> }[];
};

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export function planCustomers(table: Table, mapping: Mapping, existing: ExistingCustomer[]): CustomerPlan {
  const preview: PreviewRow[] = [];
  const valid: { line: number; row: Record<string, string> }[] = [];

  table.rows.slice(0, MAX_ROWS).forEach((r, i) => {
    const line = i + 2;
    const row = Object.fromEntries(FIELDS.customers.map((f) => [f.key, cell(r, mapping, f.key)]));
    const errors: string[] = [];
    if (!row.name) errors.push("Missing name.");
    if (row.name.length > 200) errors.push("Name is over 200 characters.");
    for (const e of row.email.split(/[;,]/).map((x) => x.trim()).filter(Boolean)) if (!EMAIL.test(e)) errors.push(`Email "${e}" isn't valid.`);
    if (row.invoice_email && !EMAIL.test(row.invoice_email)) errors.push(`Invoice email "${row.invoice_email}" isn't valid.`);
    if (errors.length) preview.push({ line, action: "error", key: row.name || "?", label: row.company, changes: [], errors, warnings: [] });
    else valid.push({ line, row });
  });

  // Merge duplicates inside the file first (same rules as the original list).
  // Each row carries its file line number through the merge.
  const merged = dedupeRows(valid.map((v) => ({ ...v.row, email: v.row.email.split(/[;,]/)[0]?.trim() ?? "", _line: String(v.line) })));
  // dedupeRows keeps only the first email per row; add any extra ones back.
  const extraEmails = new Map<string, string[]>();
  valid.forEach((v) => {
    const all = v.row.email.split(/[;,]/).map((e) => normEmail(e)).filter(Boolean);
    if (all.length > 1) extraEmails.set(all[0], all.slice(1));
  });

  const items: CustomerPlan["items"] = [];
  for (const m of merged) {
    m.emails = [...new Set([...m.emails, ...m.emails.flatMap((e) => extraEmails.get(e) ?? [])])];
    const line = Math.min(...m.merged_from.map((r) => Number(r.row._line)));
    const warnings = m.merged_from.length > 1 ? [`${m.merged_from.length} rows in this file merged (${m.merged_from.slice(1).map((x) => x.why).join("; ")}).`] : [];
    const match = findExisting(m, existing);
    if (!match) {
      preview.push({ line, action: "create", key: m.name, label: m.company_name ?? "", changes: [], errors: [], warnings });
      items.push({ action: "create", values: toValues(m) });
      continue;
    }
    // Existing customer: add new contact details and fill gaps; never overwrite what's there.
    const changes: string[] = [];
    const values: Partial<CustomerValues> = {};
    const newEmails = m.emails.filter((e) => !match.emails.includes(e));
    if (newEmails.length) {
      values.emails = [...match.emails, ...newEmails];
      changes.push(`Add email ${newEmails.join(", ")}`);
    }
    const have = new Set(match.phones.map(normPhone));
    const newPhones = m.phones.filter((p) => !have.has(normPhone(p)));
    if (newPhones.length) {
      values.phones = [...match.phones, ...newPhones];
      changes.push(`Add phone ${newPhones.join(", ")}`);
    }
    const newTags = m.tags.filter((t) => !match.tags.includes(t));
    if (newTags.length) {
      values.tags = [...match.tags, ...newTags];
      changes.push(`Add tag ${newTags.join(", ")}`);
    }
    for (const [k, label] of [
      ["company_name", "Company"],
      ["address", "Address"],
      ["postcode", "Postcode"],
      ["invoice_email", "Invoice email"],
      ["payment_terms", "Payment terms"],
    ] as const) {
      if (!match[k] && m[k]) {
        values[k] = m[k] as string;
        changes.push(`${label}: ${m[k]}`);
      }
    }
    if (m.notes && !(match.notes ?? "").includes(m.notes)) {
      values.notes = match.notes ? `${match.notes}; ${m.notes}` : m.notes;
      changes.push("Add notes");
    }
    const keptDifferent = (["company_name", "address", "payment_terms"] as const).filter((k) => match[k] && m[k] && match[k] !== m[k]);
    if (keptDifferent.length) warnings.push(`Kept the existing ${keptDifferent.map((k) => k.replace("_", " ")).join(", ")}; the file has a different value.`);
    if (!changes.length) {
      preview.push({ line, action: "unchanged", key: match.name, label: match.company_name ?? "", changes, errors: [], warnings });
      continue;
    }
    preview.push({ line, action: "update", key: match.name, label: match.company_name ?? "", changes, errors: [], warnings });
    items.push({ action: "update", id: match.id, values });
  }
  preview.sort((a, b) => a.line - b.line);
  return { preview, items };
}

function findExisting(m: ImportedCustomer, existing: ExistingCustomer[]): ExistingCustomer | undefined {
  const phones = new Set(m.phones.map(normPhone));
  return (
    existing.find((e) => e.emails.some((x) => m.emails.includes(x))) ??
    existing.find((e) => e.phones.some((p) => phones.has(normPhone(p))))
  );
}

function toValues(m: ImportedCustomer): Partial<CustomerValues> {
  return {
    name: m.name,
    company_name: m.company_name,
    emails: m.emails,
    phones: m.phones,
    address: m.address,
    postcode: m.postcode,
    notes: m.notes,
    invoice_email: m.invoice_email,
    payment_terms: m.payment_terms,
    tags: m.tags,
  };
}

export function summarise(preview: PreviewRow[]) {
  const count = (a: PreviewRow["action"]) => preview.filter((p) => p.action === a).length;
  return { create: count("create"), update: count("update"), unchanged: count("unchanged"), error: count("error"), total: preview.length };
}
