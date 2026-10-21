import "server-only";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { draftJsonSchema, draftSchema, type AiDraft } from "./schema";

export type Provider = "openai" | "anthropic";

export const DEFAULT_MODELS: Record<Provider, string> = {
  openai: "gpt-5.5",
  anthropic: "claude-sonnet-5-5",
};

const TIMEOUT_MS = 60_000;
const MAX_TOKENS = 4000;

export class AiError extends Error {}

type Call = { provider: Provider; apiKey: string; model: string; system: string; user: string };

/** One structured call, validated against the schema; retried once on a bad shape. */
export async function generateDraft(call: Call): Promise<{ draft: AiDraft; raw: unknown }> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    const raw = call.provider === "openai" ? await callOpenAI(call) : await callAnthropic(call);
    const parsed = draftSchema.safeParse(raw);
    if (parsed.success) return { draft: parsed.data, raw };
    lastErr = parsed.error;
  }
  throw new AiError(`The AI returned an unexpected format: ${String(lastErr).slice(0, 300)}`);
}

async function callOpenAI({ apiKey, model, system, user }: Call): Promise<unknown> {
  const client = new OpenAI({ apiKey, timeout: TIMEOUT_MS, maxRetries: 1 });
  try {
    const res = await client.chat.completions.create({
      model,
      max_completion_tokens: MAX_TOKENS,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name: "quote_draft", strict: true, schema: draftJsonSchema as unknown as Record<string, unknown> },
      },
    });
    const content = res.choices[0]?.message?.content;
    if (!content) throw new AiError("The AI returned no content.");
    return JSON.parse(content);
  } catch (e) {
    throw toAiError(e);
  }
}

async function callAnthropic({ apiKey, model, system, user }: Call): Promise<unknown> {
  const client = new Anthropic({ apiKey, timeout: TIMEOUT_MS, maxRetries: 1 });
  try {
    const res = await client.messages.create({
      model,
      max_tokens: MAX_TOKENS,
      system,
      messages: [{ role: "user", content: user }],
      tools: [
        {
          name: "submit_quote_draft",
          description: "Submit the structured quote proposal.",
          input_schema: draftJsonSchema as unknown as Anthropic.Tool.InputSchema,
        },
      ],
      tool_choice: { type: "tool", name: "submit_quote_draft" },
    });
    const block = res.content.find((b) => b.type === "tool_use");
    if (!block || block.type !== "tool_use") throw new AiError("The AI returned no structured draft.");
    return block.input;
  } catch (e) {
    throw toAiError(e);
  }
}

/** Cheap call used by the settings page to check a key works. */
export async function testKey(provider: Provider, apiKey: string, model: string): Promise<void> {
  try {
    if (provider === "openai") {
      await new OpenAI({ apiKey, timeout: 20_000, maxRetries: 0 }).chat.completions.create({
        model,
        max_completion_tokens: 16,
        messages: [{ role: "user", content: "Reply with OK." }],
      });
    } else {
      await new Anthropic({ apiKey, timeout: 20_000, maxRetries: 0 }).messages.create({
        model,
        max_tokens: 8,
        messages: [{ role: "user", content: "Reply with OK." }],
      });
    }
  } catch (e) {
    throw toAiError(e);
  }
}

// Never echo provider error bodies verbatim: some include request details.
function toAiError(e: unknown): AiError {
  if (e instanceof AiError) return e;
  const status = (e as { status?: number })?.status;
  if (status === 401 || status === 403) return new AiError("The AI provider rejected this API key.");
  if (status === 404) return new AiError("The AI provider doesn't recognise that model name.");
  if (status === 429) return new AiError("The AI provider is rate-limiting this key (or it has no credit). Try again shortly.");
  if (status && status >= 500) return new AiError("The AI provider had an error. Try again shortly.");
  if ((e as Error)?.name?.includes("Timeout")) return new AiError("The AI took too long to respond. Try again.");
  return new AiError("Couldn't reach the AI provider.");
}
