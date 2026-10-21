"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getTenant } from "@/lib/tenant";
import { saveAiCredentials } from "@/lib/ai-settings";
import { AiError, testKey } from "@/lib/ai/provider";

const input = z.object({
  provider: z.enum(["openai", "anthropic"]),
  model: z.string().trim().regex(/^[a-zA-Z0-9.\-_:]{2,80}$/, "Model name looks wrong."),
  apiKey: z.string().trim().min(20, "That doesn't look like an API key.").max(300),
});

export type SettingsState = { ok: boolean; message: string } | null;

export async function saveAiSettings(_prev: SettingsState, form: FormData): Promise<SettingsState> {
  const tenant = await getTenant();
  if (!tenant.can("company.settings")) return { ok: false, message: "Only an owner can change the AI key." };

  const parsed = input.safeParse({ provider: form.get("provider"), model: form.get("model"), apiKey: form.get("apiKey") });
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const { provider, model, apiKey } = parsed.data;

  if (provider === "anthropic" && !apiKey.startsWith("sk-ant-")) {
    return { ok: false, message: "Anthropic keys start with sk-ant-." };
  }

  // Prove the key works before storing it.
  try {
    await testKey(provider, apiKey, model);
  } catch (e) {
    return { ok: false, message: e instanceof AiError ? e.message : "Couldn't check that key." };
  }

  await saveAiCredentials(tenant, provider, model, apiKey);
  revalidatePath("/app/settings/ai");
  return { ok: true, message: "Key checked and saved." };
}
