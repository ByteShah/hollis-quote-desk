import type { Exclusion, QuoteLine } from "@/lib/quote/build";
import { formatGBP } from "@/lib/quote/money";
import type { Company } from "@/lib/tenant";
import { cn } from "@/components/ui";
import { formatDate } from "@/lib/dates";
import { quoteRef } from "@/lib/quote/number";

// What the customer would receive. Rendered on the server; no client JS.
// Internal detail (rate codes, AI reasoning, flags) is deliberately left out.

const CUSTOMER_REASON: Record<string, string> = {
  not_offered: "We don't carry out this work.",
  no_price: "We'll price this separately.",
  outside_trade: "This is outside the work we do.",
  needs_site_visit: "We'll need to see this before we can price it.",
  unclear: "We need a little more information to price this.",
};

export function QuotePreview({
  company,
  quote,
  customer,
  lines,
  exclusions,
  totals,
}: {
  company: Company;
  quote: { id: string; number: number; summary: string | null; outcome: string; status: string; created_at: string; questions: unknown };
  customer: { name: string; company_name: string | null; address: string | null } | null;
  lines: QuoteLine[];
  exclusions: Exclusion[];
  totals: { subtotal: number; vat: number; total: number };
}) {
  const ref = quoteRef(quote.number);
  const questions = quote.questions as string[];
  const draft = quote.status !== "approved";

  return (
    <article className="card relative mx-auto max-w-3xl overflow-hidden px-6 py-8 sm:px-12 sm:py-12 print:border-0 print:shadow-none">
      {draft && (
        <div className="no-print absolute right-0 top-0 rounded-bl-xl bg-amber-100 px-3 py-1.5 text-xs font-medium text-amber-900">
          Draft: not yet approved
        </div>
      )}

      <header className="flex flex-wrap items-start justify-between gap-6 border-b border-line pb-6">
        <div>
          <div className="text-lg font-semibold tracking-tight">{company.name}</div>
          <div className="mt-0.5 text-[13px] text-muted">Quotation</div>
        </div>
        <dl className="grid grid-cols-[auto_auto] gap-x-4 gap-y-0.5 text-[13px]">
          <dt className="text-muted">Reference</dt>
          <dd className="font-mono">{ref}</dd>
          <dt className="text-muted">Date</dt>
          <dd>{formatDate(quote.created_at, "long")}</dd>
        </dl>
      </header>

      <section className="grid gap-6 py-6 sm:grid-cols-2">
        <div>
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">Prepared for</div>
          {customer ? (
            <div className="text-sm leading-relaxed">
              <div className="font-medium">{customer.name}</div>
              {customer.company_name && <div>{customer.company_name}</div>}
              {customer.address && <div className="text-ink-2">{customer.address}</div>}
            </div>
          ) : (
            <div className="text-sm text-muted">Customer to be confirmed</div>
          )}
        </div>
        <div>
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">The job</div>
          <p className="text-sm leading-relaxed">{quote.summary}</p>
        </div>
      </section>

      {quote.outcome === "needs_site_visit" && lines.length === 0 ? (
        <section className="rounded-xl bg-sunken px-5 py-4 text-sm leading-relaxed">
          Thank you for your enquiry. For a job like this we need to visit the site before we can give you an accurate
          price. We&apos;ll be in touch to arrange a convenient time.
        </section>
      ) : (
        <section>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink/80 text-left text-[11px] uppercase tracking-[0.06em] text-muted">
                <th className="py-2 font-semibold">Description</th>
                <th className="py-2 text-right font-semibold">Qty</th>
                <th className="py-2 text-right font-semibold">Rate</th>
                <th className="py-2 text-right font-semibold">Amount</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l, i) => (
                <tr key={i} className="border-b border-line/70">
                  <td className="py-2.5 pr-4">{l.description}</td>
                  <td className="py-2.5 text-right num whitespace-nowrap">
                    {l.qty} {l.unit === "m2" ? "m²" : l.unit === "m3" ? "m³" : l.unit}
                  </td>
                  <td className="py-2.5 text-right num">{formatGBP(l.unit_rate)}</td>
                  <td className="py-2.5 text-right num">{formatGBP(l.line_total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <dl className="ml-auto mt-4 w-full max-w-xs space-y-1 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted">Subtotal (ex VAT)</dt>
              <dd className="num">{formatGBP(totals.subtotal)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted">VAT at {company.vat_rate * 100}%</dt>
              <dd className="num">{formatGBP(totals.vat)}</dd>
            </div>
            <div className="flex justify-between border-t border-ink/80 pt-2 text-base font-semibold">
              <dt>Total</dt>
              <dd className="num">{formatGBP(totals.total)}</dd>
            </div>
          </dl>
        </section>
      )}

      {exclusions.length > 0 && (
        <section className="mt-8">
          <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">Not included in this quote</h3>
          <ul className="space-y-1 text-sm">
            {exclusions.map((e, i) => (
              <li key={i}>
                <span className="font-medium">{e.request}</span>
                {/* For work the company doesn't do, the note carries the referral (e.g. "apply to the council"). */}
                <span className="text-ink-2">: {e.reason === "not_offered" && e.note ? e.note : CUSTOMER_REASON[e.reason] ?? ""}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {questions.length > 0 && (
        <section className={cn("mt-8 rounded-xl bg-sunken/70 px-5 py-4")}>
          <h3 className="mb-2 text-sm font-semibold">To finalise your quote, could you let us know:</h3>
          <ul className="list-disc space-y-1 pl-5 text-sm text-ink-2">
            {questions.map((q, i) => (
              <li key={i}>{q}</li>
            ))}
          </ul>
        </section>
      )}

      <footer className="mt-10 border-t border-line pt-4 text-xs text-muted">
        All prices exclude VAT unless shown. {company.name}.
      </footer>
    </article>
  );
}
