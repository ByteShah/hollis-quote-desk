"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getTenant, PermissionError, type Tenant } from "@/lib/tenant";
import {
  FIELDS,
  MAX_BYTES,
  MAX_ROWS,
  missingRequired,
  planCustomers,
  planRates,
  readCsv,
  suggestMapping,
  summarise,
  type ExistingCustomer,
  type Kind,
  type Mapping,
  type PreviewRow,
} from "@/lib/import/wizard";
import type { ImportAnswers, ImportQuestion } from "@/lib/import/house-rules";

// Imports: the browser sends the file text; the server parses, cleans and
// compares it with the company's data for the preview, and does all of that
// again on apply (the preview is never trusted). Applying is one database
// transaction that records a batch the user can undo.

const MAX_IMPORTS_PER_MINUTE = 5;

const input = z.object({
  kind: z.enum(["rates", "customers"]),
  filename: z.string().trim().min(1).max(200),
  text: z.string().max(MAX_BYTES, "The file is over 2 MB."),
  mapping: z.record(z.string(), z.number().int().min(0).max(200).nullable()).nullable(),
  // Answers to the preview's questions; the planner only uses ids it asked.
  answers: z
    .record(
      z.string().max(40),
      z.union([z.number().positive().max(1000), z.literal("listed"), z.array(z.string().max(20)).max(20)]),
    )
    .refine((a) => Object.keys(a).length <= 200)
    .optional(),
});

export type PreviewResult =
  | {
      ok: true;
      headers: string[];
      sample: string[][];
      mapping: Mapping;
      missing: string[];
      rows: PreviewRow[];
      summary: ReturnType<typeof summarise>;
      questions: ImportQuestion[];
      truncated: boolean;
    }
  | { ok: false; error: string };

async function plan(t: Tenant, kind: Kind, text: string, mapping: Mapping, answers: ImportAnswers = {}) {
  const table = readCsv(text);
  if (kind === "rates") {
    const { data } = await t.supabase
      .from("rates_current")
      .select("code, item, unit, category, status, notes, rate_ex_vat")
      .eq("company_id", t.company.id);
    const existing = (data ?? []).map((r) => ({ ...r, rate_ex_vat: r.rate_ex_vat == null ? null : Number(r.rate_ex_vat) }));
    return { table, ...planRates(table, mapping, existing, t.company.vat_rate, answers) };
  }
  const { data } = await t.supabase
    .from("customers")
    .select("id, name, company_name, emails, phones, address, postcode, notes, invoice_email, payment_terms, tags")
    .eq("company_id", t.company.id)
    .is("archived_at", null);
  return { table, questions: [] as ImportQuestion[], ...planCustomers(table, mapping, (data ?? []) as ExistingCustomer[]) };
}

function checkMapping(kind: Kind, mapping: Mapping, headerCount: number): Mapping {
  const clean: Mapping = {};
  for (const f of FIELDS[kind]) {
    const v = mapping[f.key];
    clean[f.key] = v != null && v < headerCount ? v : null;
  }
  return clean;
}

export async function previewImport(raw: unknown): Promise<PreviewResult> {
  try {
    const parsed = input.safeParse(raw);
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
    const t = await getTenant();
    t.require("data.import");
    const { kind, text } = parsed.data;

    const { headers, rows } = readCsv(text);
    if (headers.length < 2 || rows.length === 0) return { ok: false, error: "That file has no rows, or isn't a CSV with a header row." };
    const mapping = checkMapping(kind, parsed.data.mapping ?? suggestMapping(kind, headers), headers.length);
    const missing = missingRequired(kind, mapping);
    const result = missing.length
      ? { preview: [] as PreviewRow[], questions: [] as ImportQuestion[] }
      : await plan(t, kind, text, mapping, parsed.data.answers);
    return {
      ok: true,
      headers,
      sample: rows.slice(0, 3),
      mapping,
      missing,
      rows: result.preview,
      summary: summarise(result.preview),
      questions: result.questions,
      truncated: rows.length > MAX_ROWS,
    };
  } catch (e) {
    if (e instanceof PermissionError) return { ok: false, error: e.message };
    console.error("previewImport failed", (e as Error)?.name);
    return { ok: false, error: "Couldn't read that file." };
  }
}

export async function applyImport(raw: unknown): Promise<{ ok: true; batchId: string } | { ok: false; error: string }> {
  try {
    const parsed = input.safeParse(raw);
    if (!parsed.success || !parsed.data.mapping) return { ok: false, error: "Preview the file again." };
    const t = await getTenant();
    t.require("data.import");
    const { kind, text, filename } = parsed.data;

    const since = new Date(Date.now() - 60_000).toISOString();
    const { count } = await t.supabase
      .from("import_batches")
      .select("id", { count: "exact", head: true })
      .eq("company_id", t.company.id)
      .gte("created_at", since);
    if ((count ?? 0) >= MAX_IMPORTS_PER_MINUTE) return { ok: false, error: "Too many imports in the last minute. Wait a moment." };

    const { headers } = readCsv(text);
    const mapping = checkMapping(kind, parsed.data.mapping, headers.length);
    if (missingRequired(kind, mapping).length) return { ok: false, error: "Match the required columns first." };
    const result = await plan(t, kind, text, mapping, parsed.data.answers);
    if (result.items.length === 0) return { ok: false, error: "Nothing to import: every row is unchanged or has an error." };

    const totals = summarise(result.preview);
    const fn = kind === "rates" ? "apply_rates_import" : "apply_customers_import";
    const { data, error } = await t.supabase.rpc(fn, {
      cid: t.company.id,
      file_name: filename,
      items: result.items,
      totals,
    });
    if (error) {
      // Business-rule failures from the database (e.g. duplicate email) are safe to show.
      const msg = error.code === "P0001" || error.code === "P0002" ? error.message : "The import failed and nothing was changed.";
      return { ok: false, error: msg };
    }
    revalidatePath(kind === "rates" ? "/app/rates" : "/app/customers");
    revalidatePath("/app/imports");
    return { ok: true, batchId: data as string };
  } catch (e) {
    if (e instanceof PermissionError) return { ok: false, error: e.message };
    console.error("applyImport failed", (e as Error)?.name);
    return { ok: false, error: "The import failed and nothing was changed." };
  }
}

export async function undoImport(batchId: string): Promise<{ ok: true; summary: { restored: number; removed: number; archived: number; skipped: { label: string; reason: string }[] } } | { ok: false; error: string }> {
  try {
    if (!z.uuid().safeParse(batchId).success) return { ok: false, error: "Unknown import." };
    const t = await getTenant();
    t.require("data.import");
    const { data, error } = await t.supabase.rpc("revert_import", { batch_id: batchId });
    if (error) return { ok: false, error: error.code === "P0001" ? error.message : /already been undone/.test(error.message) ? "This import has already been undone." : "Couldn't undo the import." };
    revalidatePath("/app/imports");
    revalidatePath(`/app/imports/${batchId}`);
    revalidatePath("/app/rates");
    revalidatePath("/app/customers");
    return { ok: true, summary: data };
  } catch (e) {
    if (e instanceof PermissionError) return { ok: false, error: e.message };
    return { ok: false, error: "Couldn't undo the import." };
  }
}
