"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getTenant } from "@/lib/tenant";
import { createInvitation } from "@/lib/invites";

// Team management (owners only). Role and active changes go through the
// user's client, so RLS and the last-owner trigger both apply.

const role = z.enum(["owner", "manager", "estimator"]);
const MAX_INVITES_PER_HOUR = 20;

export async function inviteMember(input: unknown): Promise<{ ok: true; link: string; expiresAt: string } | { ok: false; error: string }> {
  const t = await getTenant();
  if (!t.can("team.manage")) return { ok: false, error: "Only an owner can invite people." };
  const parsed = z.object({ email: z.email("Enter a valid email address.").max(200), role }).safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const email = parsed.data.email.toLowerCase();

  const { data: existing } = await t.supabase.from("memberships").select("active").eq("company_id", t.company.id).ilike("email", email).maybeSingle();
  if (existing?.active) return { ok: false, error: `${email} is already in the team.` };
  if (existing) return { ok: false, error: `${email} was deactivated. Reactivate them from the team list instead.` };

  const since = new Date(Date.now() - 3600_000).toISOString();
  const { count } = await t.supabase.from("invitations").select("id", { count: "exact", head: true }).eq("company_id", t.company.id).gte("created_at", since);
  if ((count ?? 0) >= MAX_INVITES_PER_HOUR) return { ok: false, error: "Too many invitations in the last hour. Try again later." };

  try {
    const res = await createInvitation({ companyId: t.company.id, email, role: parsed.data.role, createdBy: t.user.id, createdByEmail: t.user.email });
    revalidatePath("/app/settings/team");
    return { ok: true, ...res };
  } catch {
    return { ok: false, error: "Couldn't create the invitation." };
  }
}

export async function changeRole(userId: string, next: string): Promise<{ ok: boolean; error?: string }> {
  const t = await getTenant();
  if (!t.can("team.manage")) return { ok: false, error: "Only an owner can change roles." };
  const r = role.safeParse(next);
  if (!r.success || !z.uuid().safeParse(userId).success) return { ok: false, error: "Unknown role." };
  const { data, error } = await t.supabase.from("memberships").update({ role: r.data }).eq("company_id", t.company.id).eq("user_id", userId).select("user_id");
  if (error) return { ok: false, error: error.code === "P0001" ? error.message : "Couldn't change the role." };
  if (!data?.length) return { ok: false, error: "Member not found." };
  revalidatePath("/app/settings/team");
  return { ok: true };
}

export async function setMemberActive(userId: string, active: boolean): Promise<{ ok: boolean; error?: string }> {
  const t = await getTenant();
  if (!t.can("team.manage")) return { ok: false, error: "Only an owner can do that." };
  if (!z.uuid().safeParse(userId).success) return { ok: false, error: "Member not found." };
  const { data, error } = await t.supabase.from("memberships").update({ active }).eq("company_id", t.company.id).eq("user_id", userId).select("user_id");
  if (error) return { ok: false, error: error.code === "P0001" ? error.message : "Couldn't update the member." };
  if (!data?.length) return { ok: false, error: "Member not found." };
  revalidatePath("/app/settings/team");
  return { ok: true };
}

export async function revokeInvite(id: string): Promise<{ ok: boolean; error?: string }> {
  const t = await getTenant();
  if (!t.can("team.manage")) return { ok: false, error: "Only an owner can do that." };
  if (!z.uuid().safeParse(id).success) return { ok: false, error: "Invitation not found." };
  const { data, error } = await t.supabase
    .from("invitations")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", id)
    .eq("company_id", t.company.id)
    .is("accepted_at", null)
    .select("id");
  if (error || !data?.length) return { ok: false, error: "Couldn't cancel the invitation." };
  revalidatePath("/app/settings/team");
  return { ok: true };
}
