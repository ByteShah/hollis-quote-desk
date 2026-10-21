import "server-only";
import { generateDraft } from "@/lib/ai/provider";
import { systemPrompt, userPrompt } from "@/lib/ai/prompt";
import { loadAiCredentials } from "@/lib/ai-settings";
import { matchCustomer, type CustomerRecord } from "@/lib/customers/match";
import { buildQuote, type Rate } from "./build";
import type { Tenant } from "@/lib/tenant";

export const MAX_ENQUIRY_CHARS = 10_000;
const MAX_QUOTES_PER_MINUTE = 6;

export class QuoteError extends Error {}

/**
 * Enquiry → stored draft quote. Rates and customers are read through the
 * user's RLS-scoped client, so the model only ever sees this company's data.
 */
export async function createDraftQuote(tenant: Tenant, enquiry: string): Promise<string> {
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
    supabase.from("rates").select("code, item, unit, rate_ex_vat, status, notes, modifiers").eq("company_id", company.id),
    supabase
      .from("customers")
      .select("id, name, company_name, emails, phones, address, notes, invoice_email, payment_terms")
      .eq("company_id", company.id),
  ]);
  if (rErr || cErr) throw new QuoteError("Couldn't load your rates and customers.");

  const rates: Rate[] = (rateRows ?? []).map((r) => ({
    ...r,
    rate_ex_vat: r.rate_ex_vat == null ? null : Number(r.rate_ex_vat),
  }));
  const customers = (customerRows ?? []) as CustomerRecord[];

  const matches = matchCustomer(enquiry, customers);
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

  const { draft, raw } = await generateDraft({
    provider: creds.provider,
    apiKey: creds.apiKey,
    model: creds.model,
    system: systemPrompt(company, rates),
    user: userPrompt(enquiry, customerContext),
  });

  const built = buildQuote(draft, rates, company, enquiry);

  const { data: quote, error: qErr } = await supabase
    .from("quotes")
    .insert({
      company_id: company.id,
      customer_id: best?.id ?? null,
      enquiry_text: enquiry,
      outcome: built.outcome,
      summary: draft.job_summary,
      customer_match: { matches, outcome_reason: draft.outcome_reason },
      assumptions: draft.assumptions,
      questions: draft.questions_for_customer,
      exclusions: built.exclusions,
      flags: built.flags,
      subtotal: built.subtotal,
      vat: built.vat,
      total: built.total,
      provider: creds.provider,
      model: creds.model,
      ai_raw: raw,
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

  await supabase.from("audit_log").insert({
    company_id: company.id,
    user_id: user.id,
    action: "quote.drafted",
    entity: "quote",
    entity_id: quote.id,
    detail: { provider: creds.provider, model: creds.model, outcome: built.outcome, total: built.total },
  });

  return quote.id;
}
