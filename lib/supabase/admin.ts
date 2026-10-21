import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * Service-role client: bypasses RLS. Used in exactly one place in the app,
 * reading/writing a company's encrypted AI key after membership has been
 * checked (see lib/ai-settings.ts). Everything else goes through the
 * user-scoped client.
 */
export function createAdminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
