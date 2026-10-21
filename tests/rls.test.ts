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
  let jake: SupabaseClient;
  let admin_user: SupabaseClient;
  let admin: SupabaseClient;
  let hollisId: string;
  let chaseId: string;
  const created: string[] = [];

  beforeAll(async () => {
    admin = createClient(url!, service!, { auth: { persistSession: false } });
    [dave, gaz, jake, admin_user] = await Promise.all([
      signIn("dave@hollis.test"),
      signIn("gaz@chase.test"),
      signIn("jake@hollis.test"),
      signIn("admin@quotedesk.test"),
    ]);
    const { data } = await admin.from("companies").select("id, slug");
    hollisId = data!.find((c) => c.slug === "hollis")!.id;
    chaseId = data!.find((c) => c.slug === "chase")!.id;
  });

  afterAll(async () => {
    if (created.length) {
      await admin.from("quotes").delete().in("id", created);
      await admin.from("audit_log").delete().in("entity_id", created);
    }
    await admin.from("audit_log").delete().eq("action", "import.reverted").eq("company_id", hollisId);
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

  // ---- Sprint 6: roles, price versions, history, platform admin ----

  it("Gaz can't read Hollis price versions, current prices, imports or invitations", async () => {
    for (const table of ["rate_prices", "rates_current", "import_batches", "invitations"]) {
      const { data } = await gaz.from(table).select("company_id").eq("company_id", hollisId);
      expect(data ?? [], table).toEqual([]);
    }
  });

  it("an estimator can read prices but not change them", async () => {
    const { data: rate } = await jake.from("rates_current").select("id, version, rate_ex_vat").eq("code", "EX01").single();
    expect(Number(rate!.rate_ex_vat)).toBe(14.5);
    const upd = await jake.from("rates").update({ notes: "hack" }).eq("id", rate!.id).select();
    expect(upd.data ?? []).toEqual([]);
    const ins = await jake.from("rate_prices").insert({
      company_id: hollisId, rate_id: rate!.id, price_ex_vat: 1, reason: "x", source: "manual",
      created_by: (await jake.auth.getUser()).data.user!.id,
    });
    expect(ins.error).not.toBeNull();
  });

  it("an estimator can't approve a quote", async () => {
    const { data: q } = await jake
      .from("quotes")
      .insert({ company_id: hollisId, enquiry_text: "rls test", outcome: "quote", created_by: (await jake.auth.getUser()).data.user!.id })
      .select("id")
      .single();
    created.push(q!.id);
    const { error } = await jake.from("quotes").update({ status: "approved" }).eq("id", q!.id);
    expect(error?.message).toMatch(/owner or manager/);
  });

  it("price versions are append-only, even for owners", async () => {
    const { data: p } = await dave.from("rate_prices").select("id").eq("company_id", hollisId).limit(1).single();
    const upd = await dave.from("rate_prices").update({ price_ex_vat: 1 }).eq("id", p!.id);
    const del = await dave.from("rate_prices").delete().eq("id", p!.id);
    expect(upd.error).not.toBeNull();
    expect(del.error).not.toBeNull();
  });

  it("users can only write notes to the history, not fake events", async () => {
    const fake = await dave.from("audit_log").insert({
      company_id: hollisId, user_id: (await dave.auth.getUser()).data.user!.id,
      action: "quote.approved", entity: "quote", entity_id: hollisId,
    });
    expect(fake.error).not.toBeNull();
  });

  it("a company always keeps an active owner", async () => {
    const { data: me } = await gaz.auth.getUser();
    const { error } = await gaz.from("memberships").update({ role: "manager" }).eq("user_id", me.user!.id).eq("company_id", chaseId);
    expect(error?.message).toMatch(/at least one active owner/);
  });

  it("the platform admin sees company counts but no company data", async () => {
    const { data: overview, error } = await admin_user.rpc("admin_company_overview");
    expect(error).toBeNull();
    expect(overview!.length).toBeGreaterThanOrEqual(2);
    for (const table of ["quotes", "rates", "rates_current", "customers", "rate_prices"]) {
      const { data } = await admin_user.from(table).select("id").limit(1);
      expect(data ?? [], table).toEqual([]);
    }
    const notAdmin = await dave.rpc("admin_company_overview");
    expect(notAdmin.error).not.toBeNull();
  });

  // ---- Sprints 7-10: imports, invitations, settings, setup status ----

  it("imports can't target another company or be run by an estimator", async () => {
    const item = [{ action: "create", code: "XX1", item: "x", unit: "m2", status: "active", price: 1 }];
    const cross = await gaz.rpc("apply_rates_import", { cid: hollisId, file_name: "x.csv", items: item, totals: {} });
    expect(cross.error?.message).toMatch(/owner or manager/);
    const est = await jake.rpc("apply_rates_import", { cid: hollisId, file_name: "x.csv", items: item, totals: {} });
    expect(est.error?.message).toMatch(/owner or manager/);
    const cust = await gaz.rpc("apply_customers_import", { cid: hollisId, file_name: "x.csv", items: [], totals: {} });
    expect(cust.error).not.toBeNull();
  });

  it("an import from one company can't be undone by another", async () => {
    const { data: batch } = await dave.rpc("apply_rates_import", {
      cid: hollisId, file_name: "rls-test.csv",
      items: [{ action: "create", code: "RLSTEST1", item: "RLS test", unit: "m2", status: "active", price: 1 }], totals: {},
    });
    expect(batch).toBeTruthy();
    const other = await gaz.rpc("revert_import", { batch_id: batch });
    expect(other.error?.message).toMatch(/not found/i);
    const { data: b } = await admin.from("import_batches").select("rows").eq("id", batch).single();
    const undone = await dave.rpc("revert_import", { batch_id: batch });
    expect(undone.error).toBeNull();
    expect(undone.data.removed).toBe(1);
    await admin.from("audit_log").delete().in("entity_id", (b!.rows as { record_id: string }[]).map((r) => r.record_id));
    await admin.from("import_batches").delete().eq("id", batch);
  });

  it("invitation token hashes are never readable by clients", async () => {
    const { error } = await dave.from("invitations").select("token_hash").limit(1);
    expect(error).not.toBeNull();
    const ok = await dave.from("invitations").select("email").limit(1);
    expect(ok.error).toBeNull();
  });

  it("only owners can change company settings", async () => {
    const est = await jake.from("companies").update({ min_charge: 1 }).eq("id", hollisId).select();
    expect(est.data ?? []).toEqual([]);
    const cross = await gaz.from("companies").update({ min_charge: 1 }).eq("id", hollisId).select();
    expect(cross.data ?? []).toEqual([]);
    const { data } = await admin.from("companies").select("min_charge").eq("id", hollisId).single();
    expect(Number(data!.min_charge)).toBe(450);
  });

  it("setup status is only available to members", async () => {
    expect((await gaz.rpc("company_setup_status", { cid: hollisId })).error).not.toBeNull();
    expect((await dave.rpc("company_setup_status", { cid: hollisId })).error).toBeNull();
  });

  it("two active customers can't share an email address", async () => {
    const { error } = await dave.from("customers").insert({
      company_id: hollisId, name: "Dup", emails: ["P.OKAFOR@example.com"], created_by: (await dave.auth.getUser()).data.user!.id,
    });
    expect(error?.message).toMatch(/already uses that email/);
  });

  it("an estimator can't manage the team", async () => {
    const { data: me } = await dave.auth.getUser();
    const { data } = await jake.from("memberships").update({ role: "estimator" }).eq("user_id", me.user!.id).select();
    expect(data ?? []).toEqual([]);
  });

  it("owners can only change the columns the app edits", async () => {
    const { data: me } = await gaz.auth.getUser();
    const steal = await gaz.from("memberships").update({ user_id: (await dave.auth.getUser()).data.user!.id }).eq("user_id", me.user!.id);
    expect(steal.error).not.toBeNull();
    const slug = await gaz.from("companies").update({ slug: "hijack" }).eq("id", chaseId);
    expect(slug.error).not.toBeNull();
    const rename = await gaz.from("companies").update({ name: "Chase Landscapes" }).eq("id", chaseId).select("name");
    expect(rename.error).toBeNull();
  });
});
