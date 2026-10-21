// Tenant-isolation tests against a real Supabase project (seeded with
// scripts/seed.ts). Skipped when the env vars aren't set.
import { config } from "dotenv";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

config({ path: ".env.local" });
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
const password = process.env.SEED_PASSWORD;
const enabled = Boolean(url && anon && service && password);

async function signIn(email: string): Promise<SupabaseClient> {
  const c = createClient(url!, anon!, { auth: { persistSession: false } });
  const { error } = await c.auth.signInWithPassword({ email, password: password! });
  if (error) throw error;
  return c;
}

describe.skipIf(!enabled)("row level security", () => {
  let dave: SupabaseClient;
  let gaz: SupabaseClient;
  let admin: SupabaseClient;
  let hollisId: string;
  let chaseId: string;
  const created: string[] = [];

  beforeAll(async () => {
    admin = createClient(url!, service!, { auth: { persistSession: false } });
    [dave, gaz] = await Promise.all([signIn("dave@hollis.test"), signIn("gaz@chase.test")]);
    const { data } = await admin.from("companies").select("id, slug");
    hollisId = data!.find((c) => c.slug === "hollis")!.id;
    chaseId = data!.find((c) => c.slug === "chase")!.id;
  });

  afterAll(async () => {
    if (created.length) await admin.from("quotes").delete().in("id", created);
  });

  it("each user only sees their own company", async () => {
    const { data } = await gaz.from("companies").select("id");
    expect(data!.map((c) => c.id)).toEqual([chaseId]);
  });

  it("Gaz can't read Hollis rates or customers, even by asking for them", async () => {
    const rates = await gaz.from("rates").select("id").eq("company_id", hollisId);
    const customers = await gaz.from("customers").select("id").eq("company_id", hollisId);
    expect(rates.data).toEqual([]);
    expect(customers.data).toEqual([]);
  });

  it("Gaz can't read a Hollis quote by id", async () => {
    const { data: q } = await dave
      .from("quotes")
      .insert({ company_id: hollisId, enquiry_text: "rls test", outcome: "quote", created_by: (await dave.auth.getUser()).data.user!.id })
      .select("id")
      .single();
    created.push(q!.id);
    const { data } = await gaz.from("quotes").select("id").eq("id", q!.id);
    expect(data).toEqual([]);
    const upd = await gaz.from("quotes").update({ status: "approved" }).eq("id", q!.id).select();
    expect(upd.data ?? []).toEqual([]);
  });

  it("Gaz can't create a quote inside Hollis", async () => {
    const { error } = await gaz
      .from("quotes")
      .insert({ company_id: hollisId, enquiry_text: "x", outcome: "quote", created_by: (await gaz.auth.getUser()).data.user!.id });
    expect(error).not.toBeNull();
  });

  it("nobody can read the AI key table from the client, not even their own company's row", async () => {
    for (const c of [dave, gaz]) {
      const { data, error } = await c.from("company_ai_settings").select("*");
      expect(data ?? []).toEqual([]);
      expect(error).not.toBeNull();
    }
  });

  it("the public settings function only answers for your own company", async () => {
    const { data } = await gaz.rpc("get_ai_settings_public", { cid: hollisId });
    expect(data).toEqual([]);
  });

  it("a quote can't be inserted already approved, and approval is stamped by the database", async () => {
    const userId = (await dave.auth.getUser()).data.user!.id;
    const { data: q } = await dave
      .from("quotes")
      .insert({ company_id: hollisId, enquiry_text: "x", outcome: "quote", status: "approved", created_by: userId })
      .select("id, status")
      .single();
    created.push(q!.id);
    expect(q!.status).toBe("draft");

    const { data: approved } = await dave
      .from("quotes")
      .update({ status: "approved", approved_by: chaseId })
      .eq("id", q!.id)
      .select("approved_by, approved_by_email")
      .single();
    expect(approved!.approved_by).toBe(userId);
    expect(approved!.approved_by_email).toBe("dave@hollis.test");

    const frozen = await dave.from("quotes").update({ total: 1 }).eq("id", q!.id);
    expect(frozen.error).not.toBeNull();
  });
});
