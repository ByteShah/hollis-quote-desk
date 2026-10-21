"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { lookupInvitation } from "@/lib/invites";

// Accepting an invitation. The invitee isn't a member yet, so membership is
// written with the service role, but only after the token, its expiry and
// the email address have all been checked here.

async function join(inviteId: string, companyId: string, userId: string, email: string, role: string) {
  const db = createAdminClient();
  // Claim the invitation first so a link can't be used twice in parallel.
  const { data: claimed } = await db
    .from("invitations")
    .update({ accepted_at: new Date().toISOString(), accepted_by: userId })
    .eq("id", inviteId)
    .is("accepted_at", null)
    .is("revoked_at", null)
    .select("id");
  if (!claimed?.length) return "This invitation has already been used.";
  const { error } = await db
    .from("memberships")
    .upsert({ user_id: userId, company_id: companyId, role, email, active: true }, { onConflict: "user_id,company_id" });
  if (error) return "Couldn't add you to the company.";
  return null;
}

const password = z
  .string()
  .min(10, "Use at least 10 characters.")
  .max(200)
  .refine((p) => /[a-zA-Z]/.test(p) && /\d/.test(p), "Use letters and at least one number.");

/** New person: set a password, create the account, join, sign in. */
export async function acceptWithPassword(token: string, _prev: string | null, form: FormData): Promise<string | null> {
  const invite = await lookupInvitation(token);
  if (invite.state !== "valid") return "This invitation is no longer valid.";
  const pw = password.safeParse(form.get("password"));
  if (!pw.success) return pw.error.issues[0].message;
  if (form.get("password") !== form.get("confirm")) return "The two passwords don't match.";

  const db = createAdminClient();
  const { data: created, error } = await db.auth.admin.createUser({ email: invite.email, password: pw.data, email_confirm: true });
  if (error || !created.user) {
    return /already/i.test(error?.message ?? "") ? "You already have an account. Sign in to accept the invitation." : "Couldn't create your account.";
  }
  const problem = await join(invite.id, invite.companyId, created.user.id, invite.email, invite.role);
  if (problem) return problem;

  const supabase = await createClient();
  await supabase.auth.signInWithPassword({ email: invite.email, password: pw.data });
  redirect("/app/quotes?welcome=1");
}

/** Existing account, already signed in as the invited email. */
export async function acceptAsCurrentUser(token: string): Promise<string | null> {
  const invite = await lookupInvitation(token);
  if (invite.state !== "valid") return "This invitation is no longer valid.";
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return "Sign in first.";
  if (user.email?.toLowerCase() !== invite.email.toLowerCase()) return `This invitation is for ${invite.email}.`;
  const problem = await join(invite.id, invite.companyId, user.id, invite.email, invite.role);
  if (problem) return problem;
  redirect("/app/quotes?welcome=1");
}
