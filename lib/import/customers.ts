import Papa from "papaparse";

// Customer-list import: normalise, then merge rows that are clearly the same
// person/firm. Each merge records why, so a human can undo a bad one.

export type ImportedCustomer = {
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
  merged_from: { row: Record<string, string>; why: string }[];
};

const GENERIC_DOMAINS = new Set(["example.com", "gmail.com", "hotmail.com", "outlook.com", "yahoo.co.uk", "icloud.com"]);

export const normEmail = (e: string) => e.trim().toLowerCase();
export const normPhone = (p: string) => p.replace(/\D/g, "").replace(/^44/, "0");

export function extractPostcode(addr: string): string | null {
  const m = addr.toUpperCase().match(/\b([A-Z]{1,2}\d[A-Z\d]?)(\s*\d[A-Z]{2})?\b/);
  return m ? m[0].replace(/\s+/g, " ") : null;
}

/** "14 Linden Ave, Walsall" and "14 Linden Avenue, Walsall WS5 3PL" → "14 linden avenue". */
export function addressKey(addr: string): string | null {
  const first = addr.split(",")[0].toLowerCase().trim();
  if (!/^\d+/.test(first)) return null;
  return first
    .replace(/\bave\b\.?/g, "avenue")
    .replace(/\brd\b\.?/g, "road")
    .replace(/\bst\b\.?/g, "street")
    .replace(/\bcl\b\.?/g, "close")
    .replace(/\s+/g, " ");
}

export function surname(name: string): string {
  const parts = name.toLowerCase().replace(/[^a-z\s'-]/g, " ").trim().split(/\s+/);
  return parts[parts.length - 1] ?? "";
}

const domainOf = (email: string) => email.split("@")[1] ?? "";

type Row = Record<string, string>;

export function dedupeCustomers(text: string): ImportedCustomer[] {
  const rows = Papa.parse<Row>(text.replace(/^﻿/, ""), {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim().toLowerCase(),
  }).data.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, (v ?? "").trim()])));
  return dedupeRows(rows);
}

/**
 * Merge rows that are clearly the same person or firm. Rows use the keys
 * name, company, email, phone, address, notes and optionally postcode,
 * invoice_email, payment_terms, tags (comma-separated).
 */
export function dedupeRows(input: Row[]): ImportedCustomer[] {
  const rows = input.map((r) => ({
    name: "", company: "", email: "", phone: "", address: "", notes: "",
    ...Object.fromEntries(Object.entries(r).map(([k, v]) => [k, (v ?? "").trim()])),
  })) as Row[];

  // Union-find over rows.
  const parent = rows.map((_, i) => i);
  const why: string[] = rows.map(() => "");
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const union = (a: number, b: number, reason: string) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) {
      parent[rb] = ra;
      why[b] = reason;
    }
  };

  for (let i = 0; i < rows.length; i++) {
    for (let j = i + 1; j < rows.length; j++) {
      const a = rows[i];
      const b = rows[j];
      if (a.email && b.email && normEmail(a.email) === normEmail(b.email)) {
        union(i, j, `same email ${normEmail(a.email)}`);
        continue;
      }
      if (a.phone && b.phone && normPhone(a.phone) === normPhone(b.phone)) {
        union(i, j, `same phone ${a.phone}`);
        continue;
      }
      if (surname(a.name) && surname(a.name) === surname(b.name)) {
        const ak = a.address && addressKey(a.address);
        const bk = b.address && addressKey(b.address);
        if (ak && ak === bk) {
          union(i, j, `same surname and address "${ak}"`);
          continue;
        }
        const ad = a.email && domainOf(normEmail(a.email));
        const bd = b.email && domainOf(normEmail(b.email));
        if (ad && ad === bd && !GENERIC_DOMAINS.has(ad)) {
          union(i, j, `same surname and company email domain ${ad}`);
        }
      }
    }
  }

  const groups = new Map<number, number[]>();
  rows.forEach((_, i) => {
    const r = find(i);
    groups.set(r, [...(groups.get(r) ?? []), i]);
  });

  return [...groups.values()].map((idx) => {
    const members = idx.map((i) => rows[i]);
    const longest = (vals: string[]) => vals.filter(Boolean).sort((x, y) => y.length - x.length)[0] ?? null;
    // Prefer a full name ("Patience Okafor") over initials ("Mrs P Okafor").
    const name =
      members.map((m) => m.name).find((n) => /^[A-Z][a-z]+\s+[A-Z]/.test(n) && !/^(mr|mrs|ms|miss|dr)\b/i.test(n)) ??
      longest(members.map((m) => m.name))!;
    const notes = [...new Set(members.map((m) => m.notes).filter((n) => n && n !== "DUPLICATE?"))];

    // "send invoices here not to Marcus" → that row's email is the invoice address.
    const invoiceRow = members.find((m) => /invoice/i.test(m.notes) && m.email);
    const terms = members.map((m) => m.notes.match(/(\d+)\s*day terms/i)).find(Boolean);
    const address = longest(members.map((m) => m.address));
    const explicitInvoice = members.map((m) => m.invoice_email).find(Boolean);
    const explicitTerms = members.map((m) => m.payment_terms).find(Boolean);
    const tags = [...new Set(members.flatMap((m) => (m.tags ?? "").split(/[,;]/).map((t) => t.trim().toLowerCase()).filter(Boolean)))];

    return {
      name,
      company_name: longest(members.map((m) => m.company)),
      emails: [...new Set(members.map((m) => m.email && normEmail(m.email)).filter(Boolean) as string[])],
      phones: [...new Set(members.map((m) => m.phone).filter(Boolean))],
      address,
      postcode:
        members.map((m) => m.postcode?.toUpperCase()).find(Boolean) ??
        members.map((m) => m.address && extractPostcode(m.address)).find(Boolean) ??
        null,
      notes: notes.join("; ") || null,
      invoice_email: explicitInvoice ? normEmail(explicitInvoice) : invoiceRow ? normEmail(invoiceRow.email) : null,
      payment_terms: explicitTerms || (terms ? `${terms[1]} days` : null),
      tags,
      merged_from: idx.map((i) => ({ row: rows[i], why: why[i] || "primary record" })),
    };
  });
}
