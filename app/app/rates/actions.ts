"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getTenant, PermissionError } from "@/lib/tenant";
import { ukToday } from "@/lib/rates";

// Price list writes. Each one checks the role here and is enforced again by
// RLS (owner/manager only). Edits carry the version the user loaded, so two
// people can't silently overwrite each other.

export type ActionResult<T = object> = ({ ok: true } & T) | { ok: false; error: string; conflict?: boolean };

const UNITS = ["m2", "m", "m3", "each", "job", "day", "load", "tonne"] as const;
const EDITABLE_STATUS = ["active", "price_on_request", "not_offered"] as const;

const modifier = z.object({
  label: z.string().trim().min(1, "Every extra needs a label.").max(80),
  amount: z.coerce.number().min(0).max(100000),
  per: z.enum(["unit", "flat"]),
});

const fields = z.object({
  item: z.string().trim().min(1, "Give the item a name.").max(200),
  category: z.string().trim().max(60).transform((v) => v || null),
  unit: z.enum(UNITS),
  status: z.enum(EDITABLE_STATUS),
  notes: z.string().trim().max(1000).transform((v) => v || null),
  modifiers: z.array(modifier).max(10),
  load_size: z.union([z.literal(""), z.coerce.number().positive("Load size must be more than 0.").max(1000)]).transform((v) => (v === "" ? null : v)),
  included_in: z
    .string()
    .max(200)
    .transform((v) => [...new Set(v.toUpperCase().split(/[\s,]+/).filter(Boolean))])
    .pipe(z.array(z.string().regex(/^[A-Z0-9][A-Z0-9_-]{0,19}$/, "List item codes separated by commas.")).max(20)),
  site_visit_reason: z.string().trim().max(300).transform((v) => v || null),
});

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 40) || "extra";
const withIds = (mods: z.infer<typeof modifier>[]) => mods.map((m) => ({ id: slug(m.label), ...m }));

const priceInput = z.object({
  price: z.coerce.number().min(0, "Price can't be negative.").max(999999.99),
  effective_from: z.iso.date().refine((d) => d >= "2000-01-01", "Pick a valid date."),
  reason: z.string().trim().min(3, "Say why the price is changing.").max(300),
});

function fail(e: unknown): { ok: false; error: string } {
  if (e instanceof PermissionError) return { ok: false, error: e.message };
  console.error("rates action failed", (e as Error)?.name);
  return { ok: false, error: "Something went wrong. Nothing was saved." };
}

function refresh(id?: string) {
  revalidatePath("/app/rates");
  if (id) revalidatePath(`/app/rates/${id}`);
}

export async function createRate(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const t = await getTenant();
    t.require("rate.edit");
    const parsed = fields
      .extend({
        code: z.string().trim().toUpperCase().regex(/^[A-Z0-9][A-Z0-9_-]{0,19}$/, "Codes use letters, numbers, - and _ (max 20)."),
        price: z.union([z.literal(""), z.coerce.number().min(0).max(999999.99)]).optional(),
      })
      .safeParse(input);
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
    const { code, price, modifiers, ...rest } = parsed.data;
    if (rest.unit !== "load") rest.load_size = null;
    const hasPrice = typeof price === "number";
    if (rest.status === "active" && !hasPrice) return { ok: false, error: "An item that's in use needs a price." };

    const { data: existing } = await t.supabase.from("rates").select("id").eq("company_id", t.company.id).eq("code", code).maybeSingle();
    if (existing) return { ok: false, error: `Code ${code} is already used. Codes can't be reused, even for archived items.` };

    const { data: rate, error } = await t.supabase
      .from("rates")
      .insert({
        ...rest,
        code,
        modifiers: withIds(modifiers),
        company_id: t.company.id,
        created_by: t.user.id,
        last_reviewed_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (error || !rate) return { ok: false, error: "Couldn't create the item." };

    if (hasPrice) {
      const { error: pErr } = await t.supabase.from("rate_prices").insert({
        company_id: t.company.id,
        rate_id: rate.id,
        price_ex_vat: price,
        effective_from: ukToday(),
        reason: "Price when the item was created",
        source: "manual",
        created_by: t.user.id,
      });
      if (pErr) return { ok: false, error: "The item was created but its price wasn't saved. Open it and set the price." };
    }
    refresh();
    return { ok: true, id: rate.id };
  } catch (e) {
    return fail(e);
  }
}

export async function updateRate(id: string, version: number, input: unknown): Promise<ActionResult<{ version: number }>> {
  try {
    const t = await getTenant();
    t.require("rate.edit");
    const parsed = fields.safeParse(input);
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
    const { modifiers, ...rest } = parsed.data;
    if (rest.unit !== "load") rest.load_size = null;

    const { data: current } = await t.supabase.from("rates_current").select("status, rate_ex_vat").eq("id", id).maybeSingle();
    if (!current) return { ok: false, error: "Item not found." };
    if (current.status === "archived") return { ok: false, error: "Restore this item before editing it." };
    if (rest.status === "active" && current.rate_ex_vat == null) return { ok: false, error: "Set a price before marking this item as in use." };

    const { data, error } = await t.supabase
      .from("rates")
      .update({ ...rest, modifiers: withIds(modifiers) })
      .eq("id", id)
      .eq("version", version)
      .select("version");
    if (error) return { ok: false, error: "Couldn't save the item." };
    if (!data?.length) return { ok: false, conflict: true, error: "Someone else changed this item while you were editing. Reload to see their changes." };
    refresh(id);
    return { ok: true, version: data[0].version };
  } catch (e) {
    return fail(e);
  }
}

export async function changePrice(id: string, input: unknown): Promise<ActionResult> {
  try {
    const t = await getTenant();
    t.require("rate.edit");
    const parsed = priceInput.safeParse(input);
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

    const { data: rate } = await t.supabase.from("rates").select("id, status").eq("id", id).maybeSingle();
    if (!rate) return { ok: false, error: "Item not found." };
    if (rate.status === "archived") return { ok: false, error: "Restore this item before changing its price." };

    const { error } = await t.supabase.from("rate_prices").insert({
      company_id: t.company.id,
      rate_id: id,
      price_ex_vat: parsed.data.price,
      effective_from: parsed.data.effective_from,
      reason: parsed.data.reason,
      source: "manual",
      created_by: t.user.id,
    });
    if (error) return { ok: false, error: "Couldn't save the new price." };
    // Setting a price counts as reviewing it.
    await t.supabase.from("rates").update({ last_reviewed_at: new Date().toISOString() }).eq("id", id);
    refresh(id);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function markReviewed(ids: string[]): Promise<ActionResult<{ count: number }>> {
  try {
    const t = await getTenant();
    t.require("rate.edit");
    const parsed = z.array(z.uuid()).min(1).max(500).safeParse(ids);
    if (!parsed.success) return { ok: false, error: "Nothing selected." };
    const { data, error } = await t.supabase
      .from("rates")
      .update({ last_reviewed_at: new Date().toISOString() })
      .in("id", parsed.data)
      .neq("status", "archived")
      .select("id");
    if (error) return { ok: false, error: "Couldn't mark the prices as reviewed." };
    refresh();
    parsed.data.forEach((id) => revalidatePath(`/app/rates/${id}`));
    return { ok: true, count: data?.length ?? 0 };
  } catch (e) {
    return fail(e);
  }
}

export async function setArchived(id: string, version: number, archived: boolean): Promise<ActionResult> {
  try {
    const t = await getTenant();
    t.require("rate.edit");
    const { data: current } = await t.supabase.from("rates_current").select("rate_ex_vat").eq("id", id).maybeSingle();
    if (!current) return { ok: false, error: "Item not found." };
    const { data, error } = await t.supabase
      .from("rates")
      .update(
        archived
          ? { status: "archived", archived_at: new Date().toISOString() }
          : { status: current.rate_ex_vat == null ? "price_on_request" : "active", archived_at: null },
      )
      .eq("id", id)
      .eq("version", version)
      .select("id");
    if (error) return { ok: false, error: "Couldn't update the item." };
    if (!data?.length) return { ok: false, conflict: true, error: "Someone else changed this item. Reload and try again." };
    refresh(id);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
