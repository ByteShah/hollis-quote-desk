import "server-only";
import { generateDraft, pickCategories, type Usage } from "@/lib/ai/provider";
import { systemPrompt, userPrompt } from "@/lib/ai/prompt";
import { loadAiCredentials } from "@/lib/ai-settings";
import { matchCustomer, type CustomerRecord } from "@/lib/customers/match";
import { buildQuote, type Rate } from "./build";
import { stalePriceFlags } from "./stale";
import { categoriesOf, categoryPrompt, narrowRates, needsNarrowing } from "./catalog";
import type { Tenant } from "@/lib/tenant";

export const MAX_ENQUIRY_CHARS = 10_000;
const MAX_QUOTES_PER_MINUTE = 6;

export class QuoteError extends Error {}

/**
 * Enquiry → stored draft quote. Rates and customers are read through the
 * user's RLS-scoped client, so the model only ever sees this company's data.
 */
export async function createDraftQuote(tenant: Tenant, enquiry: string, customerId?: string | null): Promise<string> {
  const { supabase, company, user } = tenant;

  const since = new Date(Date.now() - 60_000).toISOString();
  const { count } = await supabase
    .from("quotes")
    .select("id", { count: "exact", head: true })
    .eq("company_id", company.id)
    .gte("created_at", since);
  if ((count ?? 0) >= MAX_QUOTES_PER_MINUTE) throw new QuoteError("Too many quotes in the last minute; wait a moment.");

  const creds = await loadAiCredentials(tenant);
  if (!creds) throw new QuoteError("Add your company's AI key in Settings first.");

  const [{ data: rateRows, error: rErr }, { data: customerRows, error: cErr }] = await Promise.all([
    supabase
      .from("rates_current")
      .select("code, item, unit, category, rate_ex_vat, status, notes, modifiers, price_since, last_reviewed_at, load_size, included_in, site_visit_reason")
      .eq("company_id", company.id)
      .neq("status", "archived"),
    supabase
      .from("customers")
      .select("id, name, company_name, emails, phones, address, notes, invoice_email, payment_terms")
      .eq("company_id", company.id)
      .is("archived_at", null),
  ]);
  if (rErr || cErr) throw new QuoteError("Couldn't load your rates and customers.");

  const rates: Rate[] = (rateRows ?? []).map((r) => ({
    ...r,
    rate_ex_vat: r.rate_ex_vat == null ? null : Number(r.rate_ex_vat),
    load_size: r.load_size == null ? null : Number(r.load_size),
  }));
  const customers = (customerRows ?? []) as CustomerRecord[];

  // A customer chosen by the user (e.g. "New quote for this customer") wins
  // over automatic matching; it was already filtered to this company by RLS.
  const chosen = customerId ? customers.find((c) => c.id === customerId) : undefined;
  if (customerId && !chosen) throw new QuoteError("That customer couldn't be found.");
  const matches = chosen
    ? [{ customer_id: chosen.id, name: chosen.name, confidence: "high" as const, reasons: ["chosen when the quote was started"] }]
    : matchCustomer(enquiry, customers);
  const best = matches[0]?.confidence === "high" ? customers.find((c) => c.id === matches[0].customer_id) : undefined;
  const customerContext = best
    ? [
        `Name: ${best.name}${best.company_name ? ` (${best.company_name})` : ""}`,
        best.address && `Address on file: ${best.address}`,
        best.notes && `History: ${best.notes}`,
        best.payment_terms && `Payment terms: ${best.payment_terms}`,
      ]
        .filter(Boolean)
        .join("\n")
    : null;

  const base = { provider: creds.provider, apiKey: creds.apiKey, model: creds.model, cacheKey: `quote-desk:${company.id}` };
  const usage: Usage = { input: 0, cached: 0, output: 0 };

  // Large price lists: a cheap first call picks the categories this job needs,
  // so the main call doesn't carry thousands of irrelevant items.
  let offered = rates;
  let narrowedTo: string[] | null = null;
  if (needsNarrowing(rates)) {
    const picked = await pickCategories(
      { ...base, system: categoryPrompt(company.name, categoriesOf(rates)), user: userPrompt(enquiry, null) },
      categoriesOf(rates).map((c) => c.name),
    );
    Object.entries(picked.usage).forEach(([k, v]) => (usage[k as keyof Usage] += v));
    offered = narrowRates(rates, picked.categories);
    narrowedTo = picked.categories.length ? picked.categories : null;
  }

  const result = await generateDraft({ ...base, system: systemPrompt(company, offered), user: userPrompt(enquiry, customerContext) });
  Object.entries(result.usage).forEach(([k, v]) => (usage[k as keyof Usage] += v));
  const { draft, raw } = result;

  // Pricing always uses the full price list: narrowing only limits what the AI sees.
  const built = buildQuote(draft, rates, company, enquiry);
  if (narrowedTo) {
    built.flags.push({ level: "info", message: `Large price list: the AI was shown ${narrowedTo.join(", ")} (${offered.length} of ${rates.length} items).` });
  }
  built.flags.push(...stalePriceFlags(built.lines, rateRows ?? [], company.price_review_months));

  const { data: quote, error: qErr } = await supabase
    .from("quotes")
    .insert({
      company_id: company.id,
      customer_id: best?.id ?? null,
      enquiry_text: enquiry,
      outcome: built.outcome,
      summary: draft.job_summary,
      customer_match: { matches, outcome_reason: draft.outcome_reason, contact: draft.customer_contact },
      assumptions: draft.assumptions,
      questions: draft.questions_for_customer,
      exclusions: built.exclusions,
      flags: built.flags,
      subtotal: built.subtotal,
      vat: built.vat,
      total: built.total,
      provider: creds.provider,
      model: creds.model,
      ai_raw: { output: raw, usage, items_offered: offered.length, items_total: rates.length },
      created_by: user.id,
    })
    .select("id")
    .single();
  if (qErr || !quote) throw new QuoteError("Couldn't save the draft quote.");

  if (built.lines.length) {
    const { error: lErr } = await supabase
      .from("quote_lines")
      .insert(built.lines.map((l, i) => ({ ...l, quote_id: quote.id, company_id: company.id, position: i })));
    if (lErr) throw new QuoteError("Couldn't save the quote lines.");
  }

  return quote.id;
}
