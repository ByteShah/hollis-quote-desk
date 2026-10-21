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

type Call = {
  provider: Provider;
  apiKey: string;
  model: string;
  system: string;
  user: string;
  /** Groups a company's calls so the provider can reuse its cached prompt prefix. */
  cacheKey?: string;
};

export type Usage = { input: number; cached: number; output: number };

type Structured = { name: string; description: string; schema: Record<string, unknown>; maxTokens: number };

const DRAFT: Structured = {
  name: "submit_quote_draft",
  description: "Submit the structured quote proposal.",
  schema: draftJsonSchema as unknown as Record<string, unknown>,
  maxTokens: MAX_TOKENS,
};

/** One structured call, validated against the schema; retried once on a bad shape. */
export async function generateDraft(call: Call): Promise<{ draft: AiDraft; raw: unknown; usage: Usage }> {
  let lastErr: unknown;
  const usage: Usage = { input: 0, cached: 0, output: 0 };
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await structured(call, DRAFT);
    addUsage(usage, res.usage);
    const parsed = draftSchema.safeParse(res.output);
    if (parsed.success) return { draft: parsed.data, raw: res.output, usage };
    lastErr = parsed.error;
  }
  throw new AiError(`The AI returned an unexpected format: ${String(lastErr).slice(0, 300)}`);
}

const CATEGORY_PICK = (categories: string[]): Structured => ({
  name: "pick_categories",
  description: "Pick the price-list categories this job could need.",
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["categories"],
    properties: { categories: { type: "array", items: { type: "string", enum: categories } } },
  },
  maxTokens: 300,
});

/**
 * First, cheap step for large price lists: from the category names alone,
 * pick the ones the job could need, so the main call only sees those items.
 */
export async function pickCategories(call: Call, categories: string[]): Promise<{ categories: string[]; usage: Usage }> {
  const res = await structured(call, CATEGORY_PICK(categories));
  const picked = (res.output as { categories?: unknown })?.categories;
  const valid = Array.isArray(picked) ? picked.filter((c): c is string => typeof c === "string" && categories.includes(c)) : [];
  return { categories: valid, usage: res.usage };
}

function addUsage(total: Usage, u: Usage) {
  total.input += u.input;
  total.cached += u.cached;
  total.output += u.output;
}

async function structured(call: Call, spec: Structured): Promise<{ output: unknown; usage: Usage }> {
  return call.provider === "openai" ? callOpenAI(call, spec) : callAnthropic(call, spec);
}

async function callOpenAI({ apiKey, model, system, user, cacheKey }: Call, spec: Structured) {
  const client = new OpenAI({ apiKey, timeout: TIMEOUT_MS, maxRetries: 1 });
  try {
    // The system prompt (rules + price list) comes first and is identical for
    // every enquiry until the price list changes, so OpenAI's automatic prompt
    // caching bills it at the cached rate on repeat calls.
    const res = await client.chat.completions.create({
      model,
      max_completion_tokens: spec.maxTokens,
      prompt_cache_key: cacheKey,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      response_format: { type: "json_schema", json_schema: { name: spec.name, strict: true, schema: spec.schema } },
    });
    const content = res.choices[0]?.message?.content;
    if (!content) throw new AiError("The AI returned no content.");
    return {
      output: JSON.parse(content),
      usage: {
        input: res.usage?.prompt_tokens ?? 0,
        cached: res.usage?.prompt_tokens_details?.cached_tokens ?? 0,
        output: res.usage?.completion_tokens ?? 0,
      },
    };
  } catch (e) {
    throw toAiError(e);
  }
}

async function callAnthropic({ apiKey, model, system, user }: Call, spec: Structured) {
  const client = new Anthropic({ apiKey, timeout: TIMEOUT_MS, maxRetries: 1 });
  try {
    const res = await client.messages.create({
      model,
      max_tokens: spec.maxTokens,
      // Cache the rules + price list: repeat enquiries read it at a fraction of the price.
      system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: user }],
      tools: [{ name: spec.name, description: spec.description, input_schema: spec.schema as Anthropic.Tool.InputSchema }],
      tool_choice: { type: "tool", name: spec.name },
    });
    const block = res.content.find((b) => b.type === "tool_use");
    if (!block || block.type !== "tool_use") throw new AiError("The AI returned no structured draft.");
    return {
      output: block.input,
      usage: {
        input: (res.usage.input_tokens ?? 0) + (res.usage.cache_read_input_tokens ?? 0) + (res.usage.cache_creation_input_tokens ?? 0),
        cached: res.usage.cache_read_input_tokens ?? 0,
        output: res.usage.output_tokens ?? 0,
      },
    };
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
