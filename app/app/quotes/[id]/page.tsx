import { notFound } from "next/navigation";
import { getTenant } from "@/lib/tenant";
import type { Exclusion, Flag, QuoteLine } from "@/lib/quote/build";
import type { CustomerMatch } from "@/lib/customers/match";
import { OutcomeBadge, StatusBadge } from "../badges";
import { LinesEditor } from "./lines-editor";
import { ReviewActions, CustomerPicker } from "./review-actions";

const EXCLUSION_LABEL: Record<string, string> = {
  not_offered: "We don't do this",
  no_price: "No price in the rate list",
  outside_trade: "Outside our trade",
  needs_site_visit: "Needs a site visit",
  unclear: "Not enough information",
};

export default async function QuotePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { supabase, company, user } = await getTenant();

  // RLS: another company's quote id simply returns no row → 404.
  const { data: quote } = await supabase.from("quotes").select("*").eq("id", id).maybeSingle();
  if (!quote) notFound();

  const [{ data: lines }, { data: rates }, { data: customers }, { data: audit }] = await Promise.all([
    supabase.from("quote_lines").select("*").eq("quote_id", id).order("position"),
    supabase.from("rates").select("code, item, unit, rate_ex_vat").eq("company_id", company.id).eq("status", "active").order("code"),
    supabase
      .from("customers")
      .select("id, name, company_name, address, notes, invoice_email, payment_terms, emails")
      .eq("company_id", company.id)
      .order("name"),
    supabase.from("audit_log").select("action, at, detail, user_id").eq("entity_id", id).order("at"),
  ]);

  const customer = customers?.find((c) => c.id === quote.customer_id);
  const matches = ((quote.customer_match as { matches?: CustomerMatch[] })?.matches ?? []) as CustomerMatch[];
  const flags = quote.flags as Flag[];
  const exclusions = quote.exclusions as Exclusion[];
  const editable = quote.status !== "approved";

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex gap-2">
            <OutcomeBadge outcome={quote.outcome} />
            <StatusBadge status={quote.status} />
          </div>
          <h1 className="text-lg font-semibold">{quote.summary}</h1>
          <p className="text-xs text-stone-500">
            Drafted {new Date(quote.created_at).toLocaleString("en-GB")} by {quote.provider} ({quote.model})
            {quote.approved_at &&
              ` · Approved ${new Date(quote.approved_at).toLocaleString("en-GB")} by ${quote.approved_by_email ?? "a team member"}`}
          </p>
        </div>
        <ReviewActions quoteId={id} status={quote.status} />
      </div>

      {quote.outcome === "needs_site_visit" && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          <strong>Not priced: this job needs a site visit.</strong>{" "}
          {(quote.customer_match as { outcome_reason?: string })?.outcome_reason}
        </div>
      )}

      {flags.length > 0 && (
        <ul className="space-y-2">
          {flags.map((f, i) => (
            <li
              key={i}
              className={`rounded-md border px-3 py-2 text-sm ${
                f.level === "danger"
                  ? "border-red-300 bg-red-50 text-red-900"
                  : f.level === "warning"
                    ? "border-amber-200 bg-amber-50 text-amber-900"
                    : "border-stone-200 bg-white text-stone-700"
              }`}
            >
              {f.level === "danger" ? "⚠ " : ""}
              {f.message}
            </li>
          ))}
        </ul>
      )}

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <section className="card">
            <h2 className="mb-3 font-medium">Line items (ex VAT)</h2>
            <LinesEditor
              quoteId={id}
              editable={editable}
              initial={(lines ?? []).map((l) => ({
                rate_code: l.rate_code,
                description: l.description,
                qty: Number(l.qty),
                unit: l.unit,
                unit_rate: Number(l.unit_rate),
                line_total: Number(l.line_total),
                source: l.source,
                note: l.note,
              })) as QuoteLine[]}
              rates={(rates ?? []).map((r) => ({ ...r, rate_ex_vat: Number(r.rate_ex_vat) }))}
              pricing={{ vat_rate: company.vat_rate, min_charge: company.min_charge }}
              saved={{ subtotal: Number(quote.subtotal), vat: Number(quote.vat), total: Number(quote.total) }}
            />
          </section>

          {exclusions.length > 0 && (
            <section className="card">
              <h2 className="mb-2 font-medium">Not included in the price</h2>
              <ul className="space-y-2 text-sm">
                {exclusions.map((e, i) => (
                  <li key={i}>
                    <span className="font-medium">{e.request}</span>
                    <span className="ml-2 rounded bg-stone-100 px-1.5 py-0.5 text-xs">{EXCLUSION_LABEL[e.reason] ?? e.reason}</span>
                    <div className="text-stone-600">{e.note}</div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <div className="grid gap-5 sm:grid-cols-2">
            <ListCard title="Assumptions made" items={quote.assumptions as string[]} />
            <ListCard title="Questions to ask the customer" items={quote.questions as string[]} />
          </div>

          <details className="card">
            <summary className="cursor-pointer font-medium">Original enquiry</summary>
            <pre className="mt-3 whitespace-pre-wrap font-mono text-xs text-stone-700">{quote.enquiry_text}</pre>
          </details>
        </div>

        <div className="space-y-5">
          <section className="card space-y-3 text-sm">
            <h2 className="font-medium">Customer</h2>
            {customer ? (
              <div>
                <div className="font-medium">{customer.name}</div>
                {customer.company_name && <div className="text-stone-600">{customer.company_name}</div>}
                {customer.address && <div className="text-stone-600">{customer.address}</div>}
                {customer.notes && <div className="mt-1 rounded bg-stone-50 px-2 py-1">History: {customer.notes}</div>}
                {customer.payment_terms && <div className="mt-1">Payment terms: <strong>{customer.payment_terms}</strong></div>}
                {customer.invoice_email && <div>Send invoices to: <strong>{customer.invoice_email}</strong></div>}
              </div>
            ) : (
              <p className="text-stone-500">Not matched to a known customer.</p>
            )}
            {matches.length > 0 && (
              <div className="text-xs text-stone-500">
                {matches.map((m) => (
                  <div key={m.customer_id}>
                    {m.confidence === "high" ? "Matched" : "Possible match"}: {m.name} ({m.reasons.join(", ")})
                  </div>
                ))}
              </div>
            )}
            {editable && (
              <CustomerPicker
                quoteId={id}
                current={quote.customer_id}
                customers={(customers ?? []).map((c) => ({ id: c.id, name: c.company_name ? `${c.name} (${c.company_name})` : c.name }))}
              />
            )}
          </section>

          <section className="card text-sm">
            <h2 className="mb-2 font-medium">History</h2>
            <ul className="space-y-1 text-stone-600">
              {audit?.map((a, i) => (
                <li key={i}>
                  <span className="text-stone-400">{new Date(a.at).toLocaleString("en-GB")}</span> {a.action.replace("quote.", "")}
                  {a.user_id === user.id ? " (you)" : ""}
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}

function ListCard({ title, items }: { title: string; items: string[] }) {
  return (
    <section className="card">
      <h2 className="mb-2 font-medium">{title}</h2>
      {items.length ? (
        <ul className="list-disc space-y-1 pl-5 text-sm text-stone-700">
          {items.map((t, i) => <li key={i}>{t}</li>)}
        </ul>
      ) : (
        <p className="text-sm text-stone-400">None</p>
      )}
    </section>
  );
}

