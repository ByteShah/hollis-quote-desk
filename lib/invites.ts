import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Role } from "@/lib/permissions";

// Invitations. The token is 256 random bits, shown once as a link; only its
// SHA-256 hash is stored. Links expire after 7 days and work once.

export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

async function appOrigin(): Promise<string> {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? (host?.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

/**
 * Creates an invitation and returns its one-time link. Callers must have
 * checked that the current user may invite to this company with this role.
 */
export async function createInvitation(opts: {
  companyId: string;
  email: string;
  role: Role;
  createdBy: string;
  createdByEmail: string | undefined;
}): Promise<{ link: string; expiresAt: string }> {
  const token = randomBytes(32).toString("base64url");
  const db = createAdminClient();
  // One live invitation per person per company: revoke any older one.
  await db
    .from("invitations")
    .update({ revoked_at: new Date().toISOString() })
    .eq("company_id", opts.companyId)
    .ilike("email", opts.email)
    .is("accepted_at", null)
    .is("revoked_at", null);
  const { data, error } = await db
    .from("invitations")
    .insert({
      company_id: opts.companyId,
      email: opts.email.toLowerCase(),
      role: opts.role,
      token_hash: hashToken(token),
      created_by: opts.createdBy,
      created_by_email: opts.createdByEmail ?? null,
    })
    .select("expires_at")
    .single();
  if (error || !data) throw new Error("Couldn't create the invitation.");
  return { link: `${await appOrigin()}/invite/${token}`, expiresAt: data.expires_at };
}

export type InviteLookup =
  | { state: "valid"; id: string; companyId: string; companyName: string; email: string; role: Role; expiresAt: string }
  | { state: "used" | "expired" | "revoked" | "missing" };

export async function lookupInvitation(token: string): Promise<InviteLookup> {
  if (!/^[A-Za-z0-9_-]{40,60}$/.test(token)) return { state: "missing" };
  const { data } = await createAdminClient()
    .from("invitations")
    .select("id, company_id, email, role, expires_at, accepted_at, revoked_at, companies(name)")
    .eq("token_hash", hashToken(token))
    .maybeSingle();
  if (!data) return { state: "missing" };
  if (data.accepted_at) return { state: "used" };
  if (data.revoked_at) return { state: "revoked" };
  if (new Date(data.expires_at) < new Date()) return { state: "expired" };
  return {
    state: "valid",
    id: data.id,
    companyId: data.company_id,
    companyName: (data.companies as unknown as { name: string }).name,
    email: data.email,
    role: data.role as Role,
    expiresAt: data.expires_at,
  };
}
