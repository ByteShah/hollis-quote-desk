"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getTenant } from "@/lib/tenant";

const input = z.object({
  name: z.string().trim().min(2, "Enter the company name.").max(120),
  min_charge: z.coerce.number().min(0).max(100000),
  vat_percent: z.coerce.number().min(0).max(50),
  auto_quote_max_m2: z.coerce.number().min(1).max(100000),
  price_review_months: z.coerce.number().int().min(1).max(36),
  quoting_rules: z.string().trim().max(4000),
});

export type CompanyState = { ok: boolean; message: string } | null;

export async function updateCompany(_prev: CompanyState, form: FormData): Promise<CompanyState> {
  const t = await getTenant();
  if (!t.can("company.settings")) return { ok: false, message: "Only an owner can change company settings." };
  const parsed = input.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const { vat_percent, ...rest } = parsed.data;
  // RLS also limits this update to owners of this company.
  const { error } = await t.supabase
    .from("companies")
    .update({ ...rest, vat_rate: Math.round(vat_percent * 100) / 10000 })
    .eq("id", t.company.id);
  if (error) return { ok: false, message: "Couldn't save the settings." };
  revalidatePath("/app", "layout");
  return { ok: true, message: "Settings saved. New quotes use them straight away." };
}
