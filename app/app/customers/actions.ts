"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getTenant, PermissionError } from "@/lib/tenant";
import { normPhone } from "@/lib/import/customers";

// Customer writes. Anyone in the company can add and edit customers (RLS
// agrees); nobody deletes them. Edits carry the loaded version number.

export type CustomerResult<T = object> =
  | ({ ok: true } & T)
  | { ok: false; error: string; conflict?: boolean; duplicate?: { id: string; name: string } };

const list = (max: number, item: z.ZodType<string, string>) =>
  z.preprocess(
    (v) => (typeof v === "string" ? v.split(/[,;\n]/) : v),
    z.array(z.string().trim()).transform((a) => a.filter(Boolean)).pipe(z.array(item).max(max)),
  );
const optional = (max: number) => z.string().trim().max(max).transform((v) => v || null);

const fields = z.object({
  name: z.string().trim().min(1, "Give the customer a name.").max(200),
  company_name: optional(200),
  emails: list(10, z.email("One of the email addresses isn't valid.").max(200)),
  phones: list(10, z.string().max(40).regex(/^[+\d][\d\s()-]{5,}$/, "One of the phone numbers isn't valid.")),
  address: optional(300),
  postcode: optional(12),
  notes: optional(2000),
  invoice_email: z.union([z.literal(""), z.email("The invoice email isn't valid.").max(200)]).transform((v) => v || null),
  payment_terms: optional(60),
  tags: list(10, z.string().max(30)),
});

function fail(e: unknown): { ok: false; error: string } {
  if (e instanceof PermissionError) return { ok: false, error: e.message };
  console.error("customer action failed", (e as Error)?.name);
  return { ok: false, error: "Something went wrong. Nothing was saved." };
}

/** Another active customer with one of these emails or phone numbers, if any. */
async function findDuplicate(
  t: Awaited<ReturnType<typeof getTenant>>,
  emails: string[],
  phones: string[],
  exceptId?: string,
): Promise<{ id: string; name: string } | null> {
  if (emails.length) {
    let q = t.supabase
      .from("customers")
      .select("id, name")
      .eq("company_id", t.company.id)
      .is("archived_at", null)
      .overlaps("emails", emails.map((e) => e.toLowerCase()));
    if (exceptId) q = q.neq("id", exceptId);
    const { data } = await q.limit(1);
    if (data?.[0]) return data[0];
  }
  if (phones.length) {
    const { data } = await t.supabase.from("customers").select("id, name, phones").eq("company_id", t.company.id).is("archived_at", null);
    const wanted = new Set(phones.map(normPhone));
    const hit = (data ?? []).find((c) => c.id !== exceptId && (c.phones as string[]).some((p) => wanted.has(normPhone(p))));
    if (hit) return { id: hit.id, name: hit.name };
  }
  return null;
}

export async function createCustomer(input: unknown, fromQuoteId?: string | null): Promise<CustomerResult<{ id: string }>> {
  try {
    const t = await getTenant();
    t.require("customer.edit");
    const parsed = fields.safeParse(input);
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
    const quoteId = z.uuid().nullable().optional().safeParse(fromQuoteId);
    if (!quoteId.success) return { ok: false, error: "Unknown quote." };

    const dup = await findDuplicate(t, parsed.data.emails, parsed.data.phones);
    if (dup) return { ok: false, error: `${dup.name} already has that email or phone number.`, duplicate: dup };

    const { data, error } = await t.supabase
      .from("customers")
      .insert({ ...parsed.data, company_id: t.company.id, created_by: t.user.id, source: quoteId.data ? "quote" : "manual" })
      .select("id")
      .single();
    if (error?.code === "P0002") return { ok: false, error: error.message };
    if (error || !data) return { ok: false, error: "Couldn't create the customer." };

    // Created from an unmatched quote: link the quote to the new customer.
    if (quoteId.data) {
      await t.supabase.from("quotes").update({ customer_id: data.id }).eq("id", quoteId.data).is("customer_id", null).neq("status", "approved");
      revalidatePath(`/app/quotes/${quoteId.data}`);
    }
    revalidatePath("/app/customers");
    return { ok: true, id: data.id };
  } catch (e) {
    return fail(e);
  }
}

export async function updateCustomer(id: string, version: number, input: unknown): Promise<CustomerResult<{ version: number }>> {
  try {
    const t = await getTenant();
    t.require("customer.edit");
    const parsed = fields.safeParse(input);
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

    const dup = await findDuplicate(t, parsed.data.emails, parsed.data.phones, id);
    if (dup) return { ok: false, error: `${dup.name} already has that email or phone number.`, duplicate: dup };

    const { data, error } = await t.supabase
      .from("customers")
      .update(parsed.data)
      .eq("id", id)
      .eq("version", version)
      .is("archived_at", null)
      .select("version");
    if (error?.code === "P0002") return { ok: false, error: error.message };
    if (error) return { ok: false, error: "Couldn't save the customer." };
    if (!data?.length) return { ok: false, conflict: true, error: "Someone else changed this customer while you were editing. Reload to see their changes." };
    revalidatePath("/app/customers");
    revalidatePath(`/app/customers/${id}`);
    return { ok: true, version: data[0].version };
  } catch (e) {
    return fail(e);
  }
}

export async function setCustomerArchived(id: string, version: number, archived: boolean): Promise<CustomerResult> {
  try {
    const t = await getTenant();
    t.require("customer.edit");
    if (!archived) {
      // Restoring must not create a second active owner of an email address.
      const { data: c } = await t.supabase.from("customers").select("emails, phones").eq("id", id).maybeSingle();
      if (!c) return { ok: false, error: "Customer not found." };
      const dup = await findDuplicate(t, c.emails, c.phones, id);
      if (dup) return { ok: false, error: `Can't restore: ${dup.name} now uses the same email or phone.`, duplicate: dup };
    }
    const { data, error } = await t.supabase
      .from("customers")
      .update({ archived_at: archived ? new Date().toISOString() : null })
      .eq("id", id)
      .eq("version", version)
      .select("id");
    if (error) return { ok: false, error: "Couldn't update the customer." };
    if (!data?.length) return { ok: false, conflict: true, error: "Someone else changed this customer. Reload and try again." };
    revalidatePath("/app/customers");
    revalidatePath(`/app/customers/${id}`);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
