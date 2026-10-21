import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { can, type Permission, type Role } from "@/lib/permissions";

export type Company = {
  id: string;
  name: string;
  slug: string;
  vat_rate: number;
  min_charge: number;
  auto_quote_max_m2: number;
  price_review_months: number;
  quoting_rules: string;
};

export class PermissionError extends Error {}

/** The verified user, or a redirect to sign in. */
export const getUser = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, user };
});

export const isPlatformAdmin = cache(async () => {
  const { supabase } = await getUser();
  const { data } = await supabase.rpc("is_platform_admin");
  return data === true;
});

/**
 * The signed-in user and their company. The company always comes from the
 * user's active membership, never from the URL or a form field, so a request
 * can't ask to act as another tenant.
 */
export const getTenant = cache(async () => {
  const { supabase, user } = await getUser();

  const { data: membership } = await supabase
    .from("memberships")
    .select("role, companies(*)")
    .eq("user_id", user.id)
    .eq("active", true)
    .order("created_at")
    .limit(1)
    .maybeSingle();
  if (!membership?.companies) {
    if (await isPlatformAdmin()) redirect("/admin");
    redirect("/login?error=no-company");
  }

  const c = membership.companies as unknown as Company;
  const company: Company = {
    ...c,
    vat_rate: Number(c.vat_rate),
    min_charge: Number(c.min_charge),
    auto_quote_max_m2: Number(c.auto_quote_max_m2),
    price_review_months: Number(c.price_review_months),
  };
  const role = membership.role as Role;
  return {
    supabase,
    user,
    company,
    role,
    can: (p: Permission) => can(role, p),
    /** Throw unless the user may do this. Server actions call it first. */
    require(p: Permission) {
      if (!can(role, p)) throw new PermissionError("You don't have permission to do that.");
    },
  };
});

export type Tenant = Awaited<ReturnType<typeof getTenant>>;
