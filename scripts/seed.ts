/**
 * Seeds both tenants, their logins, the platform admin, and Hollis's cleaned
 * rates & customers. Safe to re-run: price lists and customers are only
 * loaded into a company that has none, so edits made in the app survive.
 * Pass --reset to replace them (customers only while the company has no quotes).
 * Uses the service role (local/CI only, never deployed).
 *
 *   npx tsx scripts/seed.ts [--reset]
 *
 * Env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SEED_PASSWORD
 */
import { config } from "dotenv";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { parseRatesCsv, type ImportedRate } from "../lib/import/rates";
import { HOLLIS_RATE_DECISIONS } from "../lib/import/hollis-decisions";
import { dedupeCustomers } from "../lib/import/customers";
import { categoryFor } from "../lib/import/categories";

config({ path: ".env.local" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const password = process.env.SEED_PASSWORD;
if (!url || !serviceKey || !password) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and SEED_PASSWORD (in .env.local).");
  process.exit(1);
}
const db = createClient(url, serviceKey, { auth: { persistSession: false } });
const root = path.join(__dirname, "..");

const HOLLIS_RULES = `- Prices are always ex VAT; the system adds VAT.
- We are NOT a council-approved contractor: we never do dropped kerbs / vehicle crossovers. Tell the customer to apply to the council.
- Car parks and large commercial jobs: Dave must visit. Never price these from an email.
- Plumbing, electrics, fencing and building work are outside our trade.
- Excavated material has to go somewhere: include muck away (EX05 per 8-wheeler load, about 10 m3 loose) or a skip (PL01) for jobs that dig out.
- A skip that has to go on the road needs the road_permit modifier on PL01.
- Block paving pattern: only add the herringbone modifier if the customer asks for herringbone or to match an existing herringbone drive; otherwise ask.`;

const CHASE_RULES = `- Prices are always ex VAT; the system adds VAT.
- We are a soft-landscaping firm: turf, planting, fencing, decking, sleepers, gravel.
- We do NOT do block paving, tarmac, concrete driveways or drainage; say so and suggest a groundworks firm.
- Gardens bigger than 150 m2 or with level changes over 1 m need a site visit.`;

const CHASE_RATES: Omit<ImportedRate, "unit_raw" | "import_notes" | "source_row">[] = [
  { code: "TF01", item: "Turf supply & lay (incl. ground prep)", unit: "m2", rate_ex_vat: 11, status: "active", notes: null, modifiers: [] },
  { code: "TS01", item: "Topsoil supply & spread 100mm", unit: "m2", rate_ex_vat: 8.5, status: "active", notes: null, modifiers: [] },
  { code: "FN01", item: "Close-board fencing 1.8m on concrete posts", unit: "m", rate_ex_vat: 75, status: "active", notes: null, modifiers: [] },
  { code: "FN02", item: "Replace fence panel (supply & fit)", unit: "each", rate_ex_vat: 95, status: "active", notes: null, modifiers: [] },
  { code: "DK01", item: "Softwood decking supply & build", unit: "m2", rate_ex_vat: 85, status: "active", notes: null, modifiers: [] },
  { code: "DK02", item: "Composite decking supply & build", unit: "m2", rate_ex_vat: 140, status: "active", notes: null, modifiers: [] },
  { code: "SL01", item: "Railway sleeper raised bed (2 high)", unit: "m", rate_ex_vat: 65, status: "active", notes: null, modifiers: [] },
  { code: "GR01", item: "Gravel garden incl. membrane 50mm", unit: "m2", rate_ex_vat: 22, status: "active", notes: null, modifiers: [] },
  { code: "MN01", item: "Garden maintenance gang", unit: "day", rate_ex_vat: 320, status: "active", notes: null, modifiers: [] },
];

async function upsertCompany(c: { slug: string; name: string; min_charge: number; quoting_rules: string }) {
  const { data, error } = await db.from("companies").upsert(c, { onConflict: "slug" }).select("id").single();
  if (error) throw error;
  return data.id as string;
}

async function ensureUser(email: string): Promise<string> {
  const { data: list, error } = await db.auth.admin.listUsers({ perPage: 1000 });
  if (error) throw error;
  const existing = list.users.find((u) => u.email === email);
  if (existing) {
    await db.auth.admin.updateUserById(existing.id, { password });
    return existing.id;
  }
  const { data, error: cErr } = await db.auth.admin.createUser({ email, password, email_confirm: true });
  if (cErr) throw cErr;
  return data.user.id;
}

const reset = process.argv.includes("--reset");

async function addMember(email: string, companyId: string, role: "owner" | "manager" | "estimator") {
  const userId = await ensureUser(email);
  const { error } = await db.from("memberships").upsert({ user_id: userId, company_id: companyId, role, email, active: true });
  if (error) throw error;
}

async function loadRates(companyId: string, rates: Partial<ImportedRate>[]) {
  const { count } = await db.from("rates").select("id", { count: "exact", head: true }).eq("company_id", companyId);
  if (count && !reset) return console.log(`  rates: kept ${count} existing items`);
  if (count) await db.from("rates").delete().eq("company_id", companyId);

  const { data, error } = await db
    .from("rates")
    .insert(
      rates.map((r) => ({
        company_id: companyId,
        code: r.code,
        item: r.item,
        category: categoryFor(r.code!),
        unit: r.unit,
        unit_raw: r.unit_raw ?? r.unit,
        status: r.status,
        archived_at: r.status === "archived" ? new Date().toISOString() : null,
        last_reviewed_at: new Date().toISOString(),
        notes: r.notes,
        modifiers: r.modifiers ?? [],
        import_notes: r.import_notes?.join(" ") || null,
        source_row: r.source_row ?? null,
      })),
    )
    .select("id, code");
  if (error) throw error;
  const idByCode = new Map(data.map((d) => [d.code, d.id]));
  const prices = rates
    .filter((r) => r.rate_ex_vat != null)
    .map((r) => ({
      company_id: companyId,
      rate_id: idByCode.get(r.code!),
      price_ex_vat: r.rate_ex_vat,
      reason: "Imported from the original price list",
      source: "seed",
    }));
  const { error: pErr } = await db.from("rate_prices").insert(prices);
  if (pErr) throw pErr;
  console.log(`  rates: loaded ${rates.length} items, ${prices.length} prices`);
}

async function main() {
  const hollis = await upsertCompany({ slug: "hollis", name: "Hollis Groundworks", min_charge: 450, quoting_rules: HOLLIS_RULES });
  const chase = await upsertCompany({ slug: "chase", name: "Chase Landscapes", min_charge: 300, quoting_rules: CHASE_RULES });

  await addMember("dave@hollis.test", hollis, "owner");
  await addMember("shaz@hollis.test", hollis, "owner");
  await addMember("jake@hollis.test", hollis, "estimator");
  await addMember("gaz@chase.test", chase, "owner");

  // Platform admin: creates companies, has no membership, sees no tenant data.
  const adminId = await ensureUser("admin@quotedesk.test");
  await db.from("platform_admins").upsert({ user_id: adminId });

  const rates = parseRatesCsv(readFileSync(path.join(root, "brief/02-rates.csv"), "utf8"), {
    vatRate: 0.2,
    decisions: HOLLIS_RATE_DECISIONS,
  });
  console.log("Hollis Groundworks");
  await loadRates(hollis, rates);
  console.log("Chase Landscapes");
  await loadRates(chase, CHASE_RATES);

  const customers = dedupeCustomers(readFileSync(path.join(root, "brief/03-customers.csv"), "utf8"));
  // Quotes reference customers, so only replace them while there are no quotes.
  const [{ count: quoteCount }, { count: customerCount }] = await Promise.all([
    db.from("quotes").select("id", { count: "exact", head: true }).eq("company_id", hollis),
    db.from("customers").select("id", { count: "exact", head: true }).eq("company_id", hollis),
  ]);
  if (!customerCount || (reset && !quoteCount)) {
    await db.from("customers").delete().eq("company_id", hollis);
    const tags = (notes: string | null) => (notes && /landlord/i.test(notes) ? ["landlord"] : notes && /refers work/i.test(notes) ? ["referrer"] : []);
    const { error } = await db
      .from("customers")
      .insert(customers.map((c) => ({ ...c, company_id: hollis, source: "import", tags: tags(c.notes) })));
    if (error) throw error;
    console.log(`  customers: loaded ${customers.length}`);
  } else {
    console.log(`  customers: kept ${customerCount} existing`);
  }

  writeImportReport(rates, customers);
  console.log("Logins: dave@ / shaz@ (owners), jake@ (estimator) hollis.test · gaz@chase.test (owner) · admin@quotedesk.test (platform admin)");
}

function writeImportReport(rates: ImportedRate[], customers: ReturnType<typeof dedupeCustomers>) {
  const md: string[] = ["# Import report: Hollis Groundworks", "", "Generated by `scripts/seed.ts`.", "", "## Rates", ""];
  md.push("| Code | Item | Unit | Rate (ex VAT) | Status | What we did |", "|---|---|---|---|---|---|");
  for (const r of rates) {
    md.push(
      `| ${r.code} | ${r.item} | ${r.unit} | ${r.rate_ex_vat ?? "-"} | ${r.status} | ${r.import_notes.join(" ").replace(/\|/g, "/") || "-"} |`,
    );
  }
  md.push("", "## Customers", "", `${customers.reduce((n, c) => n + c.merged_from.length, 0)} rows → ${customers.length} customers.`, "");
  for (const c of customers.filter((c) => c.merged_from.length > 1)) {
    md.push(`- **${c.name}**: merged ${c.merged_from.length} rows (${c.merged_from.slice(1).map((m) => m.why).join("; ")})` +
      `${c.invoice_email ? `; invoices to ${c.invoice_email}` : ""}${c.payment_terms ? `; terms ${c.payment_terms}` : ""}`);
  }
  mkdirSync(path.join(root, "docs"), { recursive: true });
  writeFileSync(path.join(root, "docs/import-report.md"), md.join("\n") + "\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
