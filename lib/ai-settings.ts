import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import type { Provider } from "@/lib/ai/provider";
import type { Tenant } from "@/lib/tenant";

// The only code that touches company_ai_settings. Callers pass a Tenant, whose
// company id was resolved from the verified user's membership, so the service
// role is never pointed at a company the caller doesn't belong to.

export async function loadAiCredentials(tenant: Tenant) {
  const { data, error } = await createAdminClient()
    .from("company_ai_settings")
    .select("provider, model, key_ciphertext")
    .eq("company_id", tenant.company.id)
    .maybeSingle();
  if (error) throw new Error("Couldn't load AI settings.");
  if (!data) return null;
  return {
    provider: data.provider as Provider,
    model: data.model as string,
    apiKey: decryptSecret(data.key_ciphertext, tenant.company.id),
  };
}

export async function saveAiCredentials(tenant: Tenant, provider: Provider, model: string, apiKey: string) {
  const { error } = await createAdminClient()
    .from("company_ai_settings")
    .upsert({
      company_id: tenant.company.id,
      provider,
      model,
      key_ciphertext: encryptSecret(apiKey, tenant.company.id),
      key_last4: apiKey.slice(-4),
      updated_by: tenant.user.id,
      updated_at: new Date().toISOString(),
    });
  if (error) throw new Error("Couldn't save AI settings.");
}
