import { Suspense } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import {
  Ban,
  Bot,
  CircleHelp,
  ClipboardList,
  FileText,
  History as HistoryIcon,
  Info,
  ListChecks,
  Lock,
  Mail,
  MapPin,
  ShieldAlert,
  TriangleAlert,
  UserPlus,
  UserRound,
} from "lucide-react";
import { getTenant } from "@/lib/tenant";
import type { Exclusion, Flag, QuoteLine } from "@/lib/quote/build";
import type { CustomerMatch } from "@/lib/customers/match";
import type { AiLine } from "@/lib/ai/schema";
import { Badge, Card, LinkButton, Skeleton, cn } from "@/components/ui";
import { OutcomeBadge, StatusBadge, timeAgo } from "@/components/status";
import { ReviewActions, CustomerPicker, PriceProposedButton } from "./review-actions";
import { QuotePreview } from "./preview";
import { QuoteTabs } from "./quote-tabs";
import { Checks } from "./checks";
import { History } from "@/components/history";
import { formatDate } from "@/lib/dates";
import { formatGBP } from "@/lib/quote/money";
import { quoteRef } from "@/lib/quote/number";

// The editor is the heaviest client bundle on the page: split it out so the
// read-only parts render first.
const LinesEditor = dynamic(() => import("./lines-editor").then((m) => m.LinesEditor), {
  loading: () => (
    <div className="space-y-2">
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton key={i} className="h-10" />
      ))}
    </div>
  ),
});

export const metadata: Metadata = { title: "Quote" };

const EXCLUSION: Record<string, { label: string; tone: "danger" | "warning" | "neutral" | "info" }> = {
  not_offered: { label: "We don't do this", tone: "danger" },
  no_price: { label: "No price in your list", tone: "warning" },
  outside_trade: { label: "Outside our trade", tone: "neutral" },
  needs_site_visit: { label: "Needs a site visit", tone: "warning" },
  unclear: { label: "Not enough information", tone: "info" },
};

export default async function QuotePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const [{ id }, { tab }] = await Promise.all([params, searchParams]);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { supabase, company, can } = await getTenant();

  // RLS: another company's quote id returns no row → 404, same as a bad id.
  const { data: quote } = await supabase.from("quotes").select("*").eq("id", id).maybeSingle();
  if (!quote) notFound();

  const [{ data: lineRows }, { data: rates }, { data: customers }, { data: drafter }] = await Promise.all([
    supabase.from("quote_lines").select("*").eq("quote_id", id).order("position"),
    supabase.from("rates_current").select("code, item, unit, rate_ex_vat").eq("company_id", company.id).eq("status", "active").order("code"),
    supabase
      .from("customers")
      .select("id, name, company_name, address, notes, invoice_email, payment_terms, emails, phones")
      .eq("company_id", company.id)
      .is("archived_at", null)
      .order("name"),
    quote.created_by
      ? supabase.from("memberships").select("email").eq("company_id", company.id).eq("user_id", quote.created_by).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const lines = (lineRows ?? []).map((l) => ({
    rate_code: l.rate_code,
    description: l.description,
    qty: Number(l.qty),
    unit: l.unit,
    unit_rate: Number(l.unit_rate),
    line_total: Number(l.line_total),
    source: l.source,
    note: l.note,
  })) as QuoteLine[];
  const customer = customers?.find((c) => c.id === quote.customer_id) ?? null;
  const approved = quote.status === "approved";
  const meta = quote.customer_match as { matches?: CustomerMatch[]; outcome_reason?: string };
  const matches = meta.matches ?? [];
  // The site-visit card lists the withheld lines, so that note would only repeat it.
  const flags = dedupeFlags(quote.flags as Flag[]).filter((f) => !/proposed line\(s\) withheld/.test(f.message));
  const checked = (quote.checked_flags as string[] | null) ?? [];
  // "KB01: …" notes still waiting to be checked show as a marker on that line.
  const lineChecks: Record<string, string[]> = {};
  for (const f of flags) {
    if (approved || f.level === "danger" || checked.includes(f.message)) continue;
    const code = f.message.match(/^([A-Z][A-Z0-9_-]{1,19}):/)?.[1];
    if (code) (lineChecks[code] ??= []).push(f.message.slice(code.length + 1).trim());
  }
  const usage = (quote.ai_raw as { usage?: { input: number; cached: number; output: number }; items_offered?: number; items_total?: number } | null)?.usage
    ? (quote.ai_raw as { usage: { input: number; cached: number; output: number }; items_offered: number; items_total: number })
    : null;
  const exclusions = quote.exclusions as Exclusion[];
  const assumptions = quote.assumptions as string[];
  const questions = quote.questions as string[];
  const editable = !approved;
  // A site visit with nothing priced: lead with what to look at, not an empty table.
  const visitFirst = quote.outcome === "needs_site_visit" && lines.length === 0;
  // What the AI thought the job needs: a starting point for the visit.
  const proposed = visitFirst ? (((quote.ai_raw as { output?: { lines?: AiLine[] } } | null)?.output?.lines ?? []) as AiLine[]) : [];
  // Offer to price the AI's lines only when no company rule required the visit.
  // (No rule warning like "over the 150 m² limit" or "TM02 needs a site visit"
  // means the AI alone decided; this also covers drafts made before that note existed.)
  const aiOnlyVisit = visitFirst && !flags.some((f) => /needs a site visit:|limit for quoting off an email/.test(f.message));
  const ref = quoteRef(quote.number);
  const totals = { subtotal: Number(quote.subtotal), vat: Number(quote.vat), total: Number(quote.total) };

  const linesCard = (
    <Card
      title={visitFirst ? "Price it after the visit" : "Line items"}
      icon={ClipboardList}
      action={<span className="text-xs text-muted">All prices ex VAT</span>}
    >
      <LinesEditor
        quoteId={id}
        editable={editable}
        initial={lines}
        rates={(rates ?? []).map((r) => ({ ...r, rate_ex_vat: Number(r.rate_ex_vat) }))}
        pricing={{ vat_rate: company.vat_rate, min_charge: company.min_charge }}
        saved={totals}
        checks={lineChecks}
      />
    </Card>
  );

  const quotePanel = (
    <div className="space-y-5">
      {visitFirst && (
        <Card
          title="Site visit needed"
          icon={MapPin}
          action={editable && aiOnlyVisit && proposed.length > 0 ? <PriceProposedButton quoteId={id} /> : undefined}
        >
          {meta.outcome_reason && <p className="text-[13px] leading-relaxed text-ink-2">{meta.outcome_reason}</p>}
          {proposed.length > 0 && (
            <>
              <div className="mb-2 mt-4 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">
                What the AI thinks the job involves (not priced)
              </div>
              <ul className="divide-y divide-line/70 rounded-lg ring-1 ring-line">
                {proposed.map((l, i) => {
                  const rate = rates?.find((r) => r.code === l.rate_code);
                  const qty =
                    l.stated_quantity != null
                      ? `about ${l.stated_quantity.toLocaleString("en-GB")} ${l.stated_unit === "m2" ? "m²" : (l.stated_unit ?? "")}`
                      : l.dimensions.length
                        ? l.dimensions.map((d) => `${d.value} ${d.unit}`).join(" × ")
                        : null;
                  return (
                    <li key={i} className="px-3 py-2.5">
                      <div className="flex flex-wrap items-center gap-2 text-sm">
                        <span className="font-mono text-xs font-medium">{l.rate_code}</span>
                        <span className="font-medium">{rate?.item ?? ""}</span>
                        {qty && <span className="text-[13px] text-muted">{qty}</span>}
                      </div>
                      <p className="mt-0.5 line-clamp-2 text-[13px] leading-relaxed text-ink-2" title={l.reasoning}>{l.reasoning}</p>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
          {!approved && <p className="mt-3 text-xs text-muted">Approve to confirm a “we&apos;ll come and have a look” reply, or price it below after the visit.</p>}
        </Card>
      )}

      {quote.outcome === "cannot_quote" && meta.outcome_reason && (
        <Card title="Couldn't be priced from your list" icon={Ban}>
          <p className="text-[13px] leading-relaxed text-ink-2">{meta.outcome_reason}</p>
        </Card>
      )}

      {!visitFirst && linesCard}

      {exclusions.length > 0 && (
        <Card title="Not included in the price" icon={Ban}>
          <ul className="divide-y divide-line/70">
            {exclusions.map((e, i) => {
              const ex = EXCLUSION[e.reason] ?? { label: e.reason, tone: "neutral" as const };
              return (
                <li key={i} className="py-2.5 first:pt-0 last:pb-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">{e.request}</span>
                    <Badge tone={ex.tone}>{ex.label}</Badge>
                  </div>
                  <p className="mt-0.5 text-[13px] leading-relaxed text-ink-2">{e.note}</p>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      {visitFirst && linesCard}
    </div>
  );

  const notesPanel = (
    <div className="space-y-5">
      {quote.summary && (
        <Card title="The job" icon={ClipboardList}>
          <p className="text-sm leading-relaxed text-ink-2">{quote.summary}</p>
        </Card>
      )}
      <div className="grid gap-5 md:grid-cols-2">
        <ListCard title="Questions for the customer" icon={CircleHelp} items={questions} />
        <ListCard title="Assumptions made" icon={Info} items={assumptions} />
      </div>
      {meta.outcome_reason && !visitFirst && (
        <Card title="Why the AI drafted it this way" icon={Bot}>
          <p className="text-[13px] leading-relaxed text-ink-2">{meta.outcome_reason}</p>
        </Card>
      )}
      {flags.length > 0 && (
        <Card title="Review notes" icon={ListChecks} action={<span className="text-xs text-muted">{checked.length} of {flags.length} checked</span>}>
          <ul className="space-y-2 text-[13px] leading-relaxed text-ink-2">
            {flags.map((f, i) => (
              <li key={i} className="flex gap-2">
                {f.level === "danger" ? (
                  <ShieldAlert className="mt-0.5 size-4 shrink-0 text-red-600" aria-hidden />
                ) : f.level === "warning" ? (
                  <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-600" aria-hidden />
                ) : (
                  <Info className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />
                )}
                <span className={cn(checked.includes(f.message) && "text-muted")}>
                  {f.message}
                  {checked.includes(f.message) && <span className="ml-1.5 text-xs text-emerald-700">✓ checked</span>}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );

  const tabs = [
    { key: "quote", label: "Quote", icon: <ListChecks className="size-3.5" aria-hidden />, content: quotePanel },
    { key: "notes", label: "Notes & questions", icon: <CircleHelp className="size-3.5" aria-hidden />, count: assumptions.length + questions.length, content: notesPanel },
    {
      key: "email",
      label: "Original email",
      icon: <Mail className="size-3.5" aria-hidden />,
      content: (
        <Card title="Original email" icon={Mail} action={<span className="text-xs text-muted">Saved with this quote, exactly as received</span>}>
          <pre className="-m-5 max-h-[40rem] overflow-auto whitespace-pre-wrap bg-sunken/40 px-5 py-4 font-mono text-xs leading-relaxed text-ink-2">
            {quote.enquiry_text}
          </pre>
        </Card>
      ),
    },
    {
      key: "history",
      label: "History",
      icon: <HistoryIcon className="size-3.5" aria-hidden />,
      content: (
        <Card title="History" icon={HistoryIcon}>
          <Suspense
            fallback={
              <div className="space-y-2">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-2/3" />
              </div>
            }
          >
            <History entity="quote" entityId={id} path={`/app/quotes/${id}`} />
          </Suspense>
        </Card>
      ),
    },
    {
      key: "preview",
      label: "Customer preview",
      icon: <FileText className="size-3.5" aria-hidden />,
      content: <QuotePreview company={company} quote={quote} customer={customer} lines={lines} exclusions={exclusions} totals={totals} />,
    },
  ];

  return (
    <div className="animate-rise">
      <nav className="no-print mb-3 text-[13px] text-muted">
        <Link href="/app/quotes" className="hover:text-ink">Quotes</Link>
        <span className="mx-1.5">/</span>
        <span className="font-mono text-ink-2">{ref}</span>
      </nav>

      {/* Just who and where: the numbers and actions live in the sidebar. */}
      <header className="no-print mb-5">
        <div className="mb-1.5 flex flex-wrap items-center gap-2">
          <span className="font-mono text-[13px] font-semibold">{ref}</span>
          <OutcomeBadge outcome={quote.outcome} />
          <StatusBadge status={quote.status} />
          {approved && (
            <span className="inline-flex items-center gap-1 text-xs text-muted" title="Approved quotes can't be edited">
              <Lock className="size-3" aria-hidden /> Locked
            </span>
          )}
        </div>
        <h1 className="text-xl font-semibold leading-tight tracking-tight">
          {customer ? (
            <>
              {customer.name}
              {customer.company_name && <span className="font-normal text-ink-2"> · {customer.company_name}</span>}
            </>
          ) : (
            <span className="text-ink-2">Customer not matched</span>
          )}
        </h1>
        {customer?.address && <p className="mt-0.5 text-[13px] text-muted">{customer.address}</p>}
      </header>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
        {/* Phones: total, actions and checks come before the lines. */}
        <div className="no-print space-y-5 lg:col-start-2 lg:row-start-1">
          <section className="card p-4">
            {quote.outcome === "quote" || lines.length > 0 ? (
              <>
                <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">Total inc VAT</div>
                <div className="mt-0.5 text-2xl font-semibold tracking-tight num">{formatGBP(totals.total)}</div>
                <div className="text-xs text-muted num">
                  {formatGBP(totals.subtotal)} + VAT {formatGBP(totals.vat)}
                </div>
              </>
            ) : (
              <>
                <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">Reply</div>
                <div className="mt-0.5 text-base font-semibold">{quote.outcome === "needs_site_visit" ? "We'll visit before pricing" : "Can't be priced"}</div>
              </>
            )}
            {approved && quote.approved_at && (
              <p className="mt-2 flex items-center gap-1.5 text-xs text-emerald-800">
                <Lock className="size-3" aria-hidden /> Approved {timeAgo(quote.approved_at)} by {quote.approved_by_email ?? "a team member"}
              </p>
            )}
            <div className="mt-4">
              <ReviewActions
                quoteId={id}
                status={quote.status}
                outcome={quote.outcome}
                total={totals.total}
                customerName={customer?.name ?? null}
                hasDanger={flags.some((f) => f.level === "danger")}
                canApprove={can("quote.approve")}
              />
            </div>
          </section>

          {!approved && <Checks quoteId={id} flags={flags} initialChecked={checked} />}
        </div>

        <div className="min-w-0 lg:col-start-1 lg:row-span-2 lg:row-start-1">
          <QuoteTabs tabs={tabs} initial={tab === undefined ? "quote" : tab} quoteId={id} />
        </div>

        <aside className="no-print space-y-5 lg:col-start-2">
          <Card title="Customer" icon={UserRound}>
            {customer ? (
              <div className="space-y-3 text-sm">
                <div>
                  <Link href={`/app/customers/${customer.id}`} className="font-medium hover:underline">{customer.name}</Link>
                  {customer.company_name && <div className="text-ink-2">{customer.company_name}</div>}
                  {customer.address && <div className="text-[13px] text-muted">{customer.address}</div>}
                </div>
                {customer.notes && (
                  <div className="rounded-lg bg-brand-soft/60 px-3 py-2 text-[13px] text-brand-ink">
                    <span className="font-medium">History:</span> {customer.notes}
                  </div>
                )}
                {(customer.payment_terms || customer.invoice_email) && (
                  <dl className="space-y-1 text-[13px]">
                    {customer.payment_terms && (
                      <div className="flex justify-between gap-3">
                        <dt className="text-muted">Payment terms</dt>
                        <dd className="font-medium">{customer.payment_terms}</dd>
                      </div>
                    )}
                    {customer.invoice_email && (
                      <div className="flex justify-between gap-3">
                        <dt className="text-muted">Invoices to</dt>
                        <dd className="truncate font-medium">{customer.invoice_email}</dd>
                      </div>
                    )}
                  </dl>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-muted">Not matched to anyone in your customer list.</p>
                {editable && (
                  <LinkButton href={`/app/customers/new?from_quote=${id}`} variant="secondary" size="sm">
                    <UserPlus className="size-3.5" /> Save as new customer
                  </LinkButton>
                )}
              </div>
            )}
            {matches.length > 0 && (
              <details className="mt-3 border-t border-line/70 pt-3 text-xs text-muted">
                <summary className="cursor-pointer select-none hover:text-ink">How they were matched</summary>
                <ul className="mt-1.5 space-y-1.5">
                  {matches.slice(0, 3).map((m) => (
                    <li key={m.customer_id}>
                      <Badge tone={m.confidence === "high" ? "success" : "warning"} className="mr-1.5">
                        {m.confidence === "high" ? "Match" : "Possible"}
                      </Badge>
                      {m.name}: {m.reasons.join(", ")}
                    </li>
                  ))}
                </ul>
              </details>
            )}
            {editable && (
              <div className="mt-4">
                <label className="label" htmlFor="customer">Change customer</label>
                <CustomerPicker
                  quoteId={id}
                  current={quote.customer_id}
                  customers={(customers ?? []).map((c) => ({ id: c.id, name: c.company_name ? `${c.name} (${c.company_name})` : c.name }))}
                />
              </div>
            )}
          </Card>

          <Card title="Details" icon={Bot}>
            <dl className="space-y-1.5 text-[13px]">
              <Row label="Drafted">{formatDate(quote.created_at, "medium")}</Row>
              {drafter?.email && <Row label="By"><span className="truncate">{drafter.email}</span></Row>}
              <Row label="AI">
                {quote.provider === "openai" ? "OpenAI" : quote.provider === "anthropic" ? "Anthropic" : quote.provider} ·{" "}
                <span className="font-mono text-xs">{quote.model}</span>
              </Row>
              {usage && (
                <>
                  <Row label="Price list sent">{usage.items_offered} of {usage.items_total} items</Row>
                  <Row label="Tokens in / out">
                    {usage.usage.input.toLocaleString("en-GB")} / {usage.usage.output.toLocaleString("en-GB")}
                  </Row>
                  <Row label="Read from cache">{usage.usage.input ? Math.round((usage.usage.cached / usage.usage.input) * 100) : 0}%</Row>
                </>
              )}
            </dl>
          </Card>
        </aside>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="shrink-0 text-muted">{label}</dt>
      <dd className="min-w-0 text-right num">{children}</dd>
    </div>
  );
}

/**
 * Older drafts logged "KB01: quantity is an AI estimate" and "KB01: low
 * confidence" with the same reasoning; show one, at the higher level.
 */
function dedupeFlags(flags: Flag[]): Flag[] {
  const rank = { danger: 0, warning: 1, info: 2 } as const;
  const byKey = new Map<string, Flag>();
  for (const f of flags) {
    const key = f.message.replace(/^([A-Z][A-Z0-9_-]{1,19}): (quantity is an AI estimate; check it\.|low confidence\.)\s*/, "$1:");
    const seen = byKey.get(key);
    if (!seen || rank[f.level] < rank[seen.level]) byKey.set(key, f);
  }
  return [...byKey.values()];
}

function ListCard({ title, icon, items }: { title: string; icon: typeof Info; items: string[] }) {
  return (
    <Card title={title} icon={icon}>
      {items.length ? (
        <ul className="space-y-2 text-[13px] leading-relaxed text-ink-2">
          {items.map((t, i) => (
            <li key={i} className="flex gap-2">
              <span className="mt-2 size-1 shrink-0 rounded-full bg-muted" />
              {t}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted">None</p>
      )}
    </Card>
  );
}
