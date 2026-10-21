/**
 * Removes everything the browser tests (tests/e2e) create, so they can run
 * against the shared demo database without leaving data behind.
 *
 *   npx tsx scripts/e2e-cleanup.mts
 */
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
config({ path: ".env.local", quiet: true });
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

const rates = (await db.from("rates").select("id").like("code", "ZZ%")).data ?? [];
const customers = (await db.from("customers").select("id").in("name", ["Zed Testperson", "Import Testperson"])).data ?? [];
const batches = (await db.from("import_batches").select("id").like("filename", "%-test.csv")).data ?? [];
const ids = [...rates, ...customers, ...batches].map((r) => r.id);
if (ids.length) await db.from("audit_log").delete().in("entity_id", ids);
if (rates.length) await db.from("rates").delete().in("id", rates.map((r) => r.id));
if (customers.length) await db.from("customers").delete().in("id", customers.map((r) => r.id));
if (batches.length) await db.from("import_batches").delete().in("id", batches.map((r) => r.id));
await db.from("companies").delete().like("slug", "e2e-%");
const users = ((await db.auth.admin.listUsers({ perPage: 1000 })).data?.users ?? []).filter((u) => /^e2e\./.test(u.email ?? ""));
for (const u of users) await db.auth.admin.deleteUser(u.id);
console.log(`e2e cleanup: ${rates.length} items, ${customers.length} customers, ${batches.length} imports, ${users.length} users`);
