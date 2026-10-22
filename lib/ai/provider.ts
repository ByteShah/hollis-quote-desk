import "server-only";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { draftJsonSchema, draftSchema, nullableAsAnyOf, type AiDraft } from "./schema";
import { log, since } from "@/lib/log";

export type Provider = "openai" | "anthropic";

export const DEFAULT_MODELS: Record<Provider, string> = {
  openai: "gpt-5.5",
  anthropic: "claude-sonnet-5-5",
};

const TIMEOUT_MS = 90_000;
// Reasoning/thinking tokens count against this limit on current models, so it
// is a ceiling, not a target: a typical draft uses well under 2,000.
const MAX_TOKENS = 16_000;

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

/** How hard the model thinks (Anthropic `effort`; ignored for OpenAI). */
type Effort = "low" | "medium";

type Structured = { name: string; description: string; schema: Record<string, unknown>; maxTokens: number; effort: Effort };

const DRAFT: Structured = {
  name: "submit_quote_draft",
  description: "Submit the structured quote proposal.",
  schema: draftJsonSchema as unknown as Record<string, unknown>,
  maxTokens: MAX_TOKENS,
  // Reading an email and choosing codes needs some judgement (site visit or
  // not, what to estimate), but not deep reasoning.
  effort: "medium",
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
    log.warn("ai.bad_shape", { model: call.model, attempt, issues: parsed.error.issues.slice(0, 5).map((i) => `${i.path.join(".")}: ${i.code}`) });
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
  maxTokens: 4000,
  effort: "low",
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
  const t = performance.now();
  const base = { purpose: spec.name, provider: call.provider, model: call.model };
  try {
    const res = call.provider === "openai" ? await callOpenAI(call, spec) : await callAnthropic(call, spec);
    log.info("ai.call", { ...base, ok: true, ms: since(t), tokens_in: res.usage.input, tokens_cached: res.usage.cached, tokens_out: res.usage.output });
    return res;
  } catch (e) {
    log.warn("ai.call", { ...base, ok: false, ms: since(t), error: (e as Error).message });
    throw e;
  }
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
    // Structured output rather than a forced tool call: current Claude models
    // (Sonnet 5.5, Opus 5.5) reject forced tool_choice with a 400.
    const res = await client.messages.create({
      model,
      max_tokens: spec.maxTokens,
      // Cache the rules + price list: repeat enquiries read it at a fraction of the price.
      system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: user }],
      output_config: { effort: spec.effort, format: { type: "json_schema", schema: nullableAsAnyOf(spec.schema) as Record<string, unknown> } },
    });
    if (res.stop_reason === "refusal") throw new AiError("The AI declined to draft this enquiry. Draft it by hand.");
    if (res.stop_reason === "max_tokens") throw new AiError("The AI's answer was cut off. Try again.");
    const text = res.content.find((b) => b.type === "text");
    if (!text || text.type !== "text") throw new AiError("The AI returned no structured draft.");
    let output: unknown;
    try {
      output = JSON.parse(text.text);
    } catch {
      throw new AiError("The AI returned an unexpected format.");
    }
    return {
      output,
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

const KEY_CHECK: Structured = {
  name: "key_check",
  description: "Confirm the connection works.",
  schema: { type: "object", additionalProperties: false, required: ["ok"], properties: { ok: { type: "boolean" } } },
  maxTokens: 2000,
  effort: "low",
};

/**
 * Cheap call used by the settings page to check a key works. It goes through
 * the same structured-output path as real drafts, so a model that can't do
 * that is caught here rather than on the first enquiry.
 */
export async function testKey(provider: Provider, apiKey: string, model: string): Promise<void> {
  await structured({ provider, apiKey, model, system: "Answer with ok: true.", user: "Check the connection." }, KEY_CHECK);
}

// Never echo provider error bodies verbatim: some include request details.
function toAiError(e: unknown): AiError {
  if (e instanceof AiError) return e;
  const status = (e as { status?: number })?.status;
  // The provider's own error type and status (never its body, which can echo the request).
  log.warn("ai.provider_error", { status: status ?? null, type: (e as Error)?.name ?? "unknown" });
  if (status === 401 || status === 403) return new AiError("The AI provider rejected this API key.");
  if (status === 404) return new AiError("The AI provider doesn't recognise that model name.");
  if (status === 400) return new AiError("The AI provider rejected the request. Check the model name is a current model that supports structured output.");
  if (status === 429) return new AiError("The AI provider is rate-limiting this key (or it has no credit). Try again shortly.");
  if (status && status >= 500) return new AiError("The AI provider had an error. Try again shortly.");
  if ((e as Error)?.name?.includes("Timeout")) return new AiError("The AI took too long to respond. Try again.");
  return new AiError("Couldn't reach the AI provider.");
}
