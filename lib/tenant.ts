import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type Company = {
  id: string;
  name: string;
  slug: string;
  vat_rate: number;
  min_charge: number;
  auto_quote_max_m2: number;
  quoting_rules: string;
};

/**
 * The signed-in user and their company. The company always comes from the
 * memberships table for the verified user, never from the URL or a form
 * field, so a request can't ask to act as another tenant.
 */
export const getTenant = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: membership } = await supabase
    .from("memberships")
    .select("role, companies(*)")
    .eq("user_id", user.id)
    .order("created_at")
    .limit(1)
    .single();
  if (!membership?.companies) redirect("/login?error=no-company");

  const c = membership.companies as unknown as Company;
  const company: Company = {
    ...c,
    vat_rate: Number(c.vat_rate),
    min_charge: Number(c.min_charge),
    auto_quote_max_m2: Number(c.auto_quote_max_m2),
  };
  return { supabase, user, company, role: membership.role as "owner" | "staff" };
});

export type Tenant = Awaited<ReturnType<typeof getTenant>>;
