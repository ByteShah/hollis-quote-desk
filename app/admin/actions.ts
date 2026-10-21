"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getUser, isPlatformAdmin } from "@/lib/tenant";
import { createAdminClient } from "@/lib/supabase/admin";
import { createInvitation } from "@/lib/invites";

// Platform admin actions. Each re-checks platform-admin status; the service
// role is used only to create a company row and its owner invitation.

const DEFAULT_RULES = `- Prices are always ex VAT; the system adds VAT.
- If we don't do a type of work, say so and don't price it.
- Large or commercial jobs need a site visit; don't price them from an email.`;

const companyInput = z.object({
  name: z.string().trim().min(2, "Enter the company name.").max(120),
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9-]{1,40}$/, "Short name: lowercase letters, numbers and dashes."),
  owner_email: z.email("Enter the owner's email.").max(200),
  min_charge: z.coerce.number().min(0).max(100000),
  auto_quote_max_m2: z.coerce.number().min(1).max(100000),
});

type Result = { ok: true; link: string; expiresAt: string; company: string } | { ok: false; error: string };

export async function createCompany(input: unknown): Promise<Result> {
  const { user } = await getUser();
  if (!(await isPlatformAdmin())) return { ok: false, error: "Not allowed." };
  const parsed = companyInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const { owner_email, ...company } = parsed.data;

  const db = createAdminClient();
  const { data, error } = await db.from("companies").insert({ ...company, quoting_rules: DEFAULT_RULES }).select("id, name").single();
  if (error?.code === "23505") return { ok: false, error: "That short name is already taken." };
  if (error || !data) return { ok: false, error: "Couldn't create the company." };
  await db.from("audit_log").insert({
    company_id: data.id, user_id: user.id, user_email: user.email, action: "company.created", entity: "company", entity_id: data.id,
    detail: { by: "platform admin", owner_email },
  });
  const invite = await createInvitation({ companyId: data.id, email: owner_email, role: "owner", createdBy: user.id, createdByEmail: user.email });
  revalidatePath("/admin");
  return { ok: true, company: data.name, ...invite };
}

export async function inviteOwner(companyId: string, email: string): Promise<Result> {
  const { user } = await getUser();
  if (!(await isPlatformAdmin())) return { ok: false, error: "Not allowed." };
  const parsed = z.object({ companyId: z.uuid(), email: z.email().max(200) }).safeParse({ companyId, email });
  if (!parsed.success) return { ok: false, error: "Enter a valid email." };
  const { data } = await createAdminClient().from("companies").select("name").eq("id", companyId).maybeSingle();
  if (!data) return { ok: false, error: "Company not found." };
  const invite = await createInvitation({ companyId, email: parsed.data.email, role: "owner", createdBy: user.id, createdByEmail: user.email });
  revalidatePath("/admin");
  return { ok: true, company: data.name, ...invite };
}
