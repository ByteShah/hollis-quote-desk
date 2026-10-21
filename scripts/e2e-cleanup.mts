// Removes everything the onboarding e2e test creates (company, its data, test users).
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
config({ path: ".env.local", quiet: true });
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const { error } = await db.from("companies").delete().like("slug", "e2e-%");
const { data } = await db.auth.admin.listUsers({ perPage: 1000 });
const users = (data?.users ?? []).filter((u) => /^e2e\./.test(u.email ?? ""));
for (const u of users) await db.auth.admin.deleteUser(u.id);
console.log("cleanup:", error?.message ?? "companies ok", "users", users.length);
