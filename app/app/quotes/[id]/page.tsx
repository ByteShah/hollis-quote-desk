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
  const meta = quote.customer_match as { matches?: CustomerMatch[]; outcome_reason?: string };
  const matches = meta.matches ?? [];
  const flags = dedupeFlags(quote.flags as Flag[]);
  // "KB01: …" notes also show as a Check marker on that line.
  const checks: Record<string, string[]> = {};
  for (const f of flags) {
    const code = f.level !== "danger" ? f.message.match(/^([A-Z][A-Z0-9_-]{1,19}):/)?.[1] : undefined;
    if (code) (checks[code] ??= []).push(f.message.slice(code.length + 1).trim());
  }
  const usage = (quote.ai_raw as { usage?: { input: number; cached: number; output: number }; items_offered?: number; items_total?: number } | null)?.usage
    ? (quote.ai_raw as { usage: { input: number; cached: number; output: number }; items_offered: number; items_total: number })
    : null;
  const exclusions = quote.exclusions as Exclusion[];
  // On a site-visit job nothing is priced, but what the AI thought the job
  // needs is a useful starting point for the visit.
  const proposed =
    quote.outcome === "needs_site_visit" && lines.length === 0
      ? (((quote.ai_raw as { output?: { lines?: AiLine[] } } | null)?.output?.lines ?? []) as AiLine[])
      : [];
  const editable = quote.status !== "approved";
  // A site visit with nothing priced: lead with what to look at, not an empty table.
  const visitFirst = quote.outcome === "needs_site_visit" && lines.length === 0;
  // Offer to price the AI's lines only when no company rule required the visit.
  // (No rule warning like "over the 150 m² limit" or "TM02 needs a site visit"
  // means the AI alone decided; this also covers drafts made before that note existed.)
  const aiOnlyVisit = visitFirst && !flags.some((f) => /needs a site visit:|limit for quoting off an email/.test(f.message));
  const view = (["preview", "notes", "email", "history"] as const).find((t) => t === tab) ?? "lines";
  const preview = view === "preview";
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
        checks={checks}
      />
    </Card>
  );

  const TABS = [
    { key: "lines", label: "Quote", icon: ListChecks },
    { key: "notes", label: "Notes & questions", icon: CircleHelp, count: (quote.assumptions as string[]).length + (quote.questions as string[]).length },
    { key: "email", label: "Original email", icon: Mail },
    { key: "history", label: "History", icon: HistoryIcon },
    { key: "preview", label: "Customer preview", icon: FileText },
  ] as const;

  return (
    <div className="animate-rise">
      <nav className="no-print mb-4 text-[13px] text-muted">
        <Link href="/app/quotes" className="hover:text-ink">Quotes</Link>
        <span className="mx-1.5">/</span>
        <span className="font-mono text-ink-2">{ref}</span>
      </nav>

      {/* Reads like the top of a real quote: who, where, when, how much. */}
      <header className="no-print card mb-5 flex flex-col gap-5 px-5 py-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="font-mono text-[13px] font-semibold tracking-tight">Quote {ref}</span>
            <OutcomeBadge outcome={quote.outcome} />
            <StatusBadge status={quote.status} />
          </div>
          <h1 className="text-lg font-semibold leading-snug tracking-tight">
            {customer ? (
              <Link href={`/app/customers/${customer.id}`} className="hover:underline">
                {customer.name}
                {customer.company_name && <span className="font-normal text-ink-2"> · {customer.company_name}</span>}
              </Link>
            ) : (
              <span className="text-ink-2">Customer not matched</span>
            )}
          </h1>
          {customer?.address && <p className="text-[13px] text-muted">{customer.address}</p>}
          {quote.summary && <p className="mt-2 max-w-3xl text-sm leading-relaxed text-ink-2">{quote.summary}</p>}
          <p className="mt-2 text-xs text-muted">
            Drafted {formatDate(quote.created_at, "long")}
            {drafter?.email && <> by {drafter.email}</>}
            {quote.model && <> · {quote.model}</>}
            {quote.approved_at && <> · approved {timeAgo(quote.approved_at)} by {quote.approved_by_email ?? "a team member"}</>}
          </p>
        </div>
        <div className="flex shrink-0 flex-col gap-3 lg:items-end">
          {quote.outcome === "quote" && (
            <div className="lg:text-right">
              <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">Total inc VAT</div>
              <div className="text-2xl font-semibold tracking-tight num">{formatGBP(totals.total)}</div>
              <div className="text-xs text-muted num">
                {formatGBP(totals.subtotal)} + VAT {formatGBP(totals.vat)}
              </div>
            </div>
          )}
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
      </header>

      {!preview && (
        <>
          <OutcomeBanner outcome={quote.outcome} status={quote.status} reason={meta.outcome_reason} />
          <Checks flags={flags} />
        </>
      )}

      <div className="no-print mb-5 flex max-w-full overflow-x-auto">
        <div className="inline-flex rounded-lg bg-sunken p-1 ring-1 ring-line">
          {TABS.map(({ key, label, icon: Icon, ...t }) => {
            const active = key === view;
            const count = "count" in t ? t.count : 0;
            return (
              <Link
                key={key}
                href={key === "lines" ? `/app/quotes/${id}` : `/app/quotes/${id}?tab=${key}`}
                replace
                scroll={false}
                className={cn(
                  "flex items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-[13px] transition",
                  active ? "bg-surface font-medium text-ink shadow-(--shadow-card)" : "text-muted hover:text-ink",
                )}
              >
                <Icon className="size-3.5" aria-hidden /> {label}
                {count > 0 && <span className="rounded-full bg-line px-1.5 text-[11px] num text-ink-2">{count}</span>}
              </Link>
            );
          })}
        </div>
      </div>

      {preview ? (
        <QuotePreview company={company} quote={quote} customer={customer} lines={lines} exclusions={exclusions} totals={totals} />
      ) : (
        <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
          <div className="min-w-0 space-y-5">
            {view === "lines" && (
              <>
                {!visitFirst && linesCard}

                {proposed.length > 0 && (
                  <Card
                    title="For the site visit (not priced)"
                    icon={MapPin}
                    action={editable && aiOnlyVisit ? <PriceProposedButton quoteId={id} /> : <span className="text-xs text-muted">What the AI thinks the job involves</span>}
                  >
                    <ul className="divide-y divide-line/70">
                      {proposed.map((l, i) => {
                        const rate = rates?.find((r) => r.code === l.rate_code);
                        const qty =
                          l.stated_quantity != null
                            ? `about ${l.stated_quantity.toLocaleString("en-GB")} ${l.stated_unit === "m2" ? "m²" : l.stated_unit ?? ""}`
                            : l.dimensions.length
                              ? l.dimensions.map((d) => `${d.value} ${d.unit}`).join(" × ")
                              : null;
                        return (
                          <li key={i} className="py-3 first:pt-0 last:pb-0">
                            <div className="flex flex-wrap items-center gap-2 text-sm">
                              <span className="font-mono text-xs font-medium">{l.rate_code}</span>
                              <span className="font-medium">{rate?.item ?? ""}</span>
                              {qty && <span className="text-[13px] text-muted">{qty}</span>}
                            </div>
                            <p className="mt-1 text-[13px] leading-relaxed text-ink-2">{l.reasoning}</p>
                          </li>
                        );
                      })}
                    </ul>
                  </Card>
                )}

                {exclusions.length > 0 && (
                  <Card title="Not included in the price" icon={Ban}>
                    <ul className="divide-y divide-line/70">
                      {exclusions.map((e, i) => {
                        const ex = EXCLUSION[e.reason] ?? { label: e.reason, tone: "neutral" as const };
                        return (
                          <li key={i} className="py-3 first:pt-0 last:pb-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-sm font-medium">{e.request}</span>
                              <Badge tone={ex.tone}>{ex.label}</Badge>
                            </div>
                            <p className="mt-1 text-[13px] leading-relaxed text-ink-2">{e.note}</p>
                          </li>
                        );
                      })}
                    </ul>
                  </Card>
                )}
                {visitFirst && linesCard}
              </>
            )}

            {view === "notes" && (
              <>
                <ListCard title="Questions for the customer" icon={CircleHelp} items={quote.questions as string[]} />
                <ListCard title="Assumptions made" icon={Info} items={quote.assumptions as string[]} />
                {meta.outcome_reason && (
                  <Card title="Why the AI drafted it this way" icon={Bot}>
                    <p className="text-[13px] leading-relaxed text-ink-2">{meta.outcome_reason}</p>
                  </Card>
                )}
              </>
            )}

            {view === "email" && (
              <Card title="Original email" icon={Mail} action={<span className="text-xs text-muted">Saved with this quote, exactly as received</span>}>
                <pre className="-m-5 max-h-[40rem] overflow-auto whitespace-pre-wrap bg-sunken/40 px-5 py-4 font-mono text-xs leading-relaxed text-ink-2">
                  {quote.enquiry_text}
                </pre>
              </Card>
            )}

            {view === "history" && (
              <Card title="History" icon={HistoryIcon}>
                <Suspense
                  fallback={
                    <div className="space-y-2">
                      <Skeleton className="h-4 w-3/4" />
                      <Skeleton className="h-4 w-2/3" />
                    </div>
                  }
                >
                  <History entity="quote" entityId={id} path={`/app/quotes/${id}?tab=history`} />
                </Suspense>
              </Card>
            )}
          </div>

          <aside className="space-y-5">
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
                <ul className="mt-3 space-y-1.5 border-t border-line/70 pt-3">
                  {matches.slice(0, 3).map((m) => (
                    <li key={m.customer_id} className="text-xs text-muted">
                      <Badge tone={m.confidence === "high" ? "success" : "warning"} className="mr-1.5">
                        {m.confidence === "high" ? "Match" : "Possible"}
                      </Badge>
                      {m.name}: {m.reasons.join(", ")}
                    </li>
                  ))}
                </ul>
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

            <Card title="AI draft" icon={Bot}>
              <dl className="space-y-1.5 text-[13px]">
                <div className="flex justify-between gap-3">
                  <dt className="text-muted">Provider</dt>
                  <dd className="font-medium">{quote.provider === "openai" ? "OpenAI" : quote.provider === "anthropic" ? "Anthropic" : quote.provider}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted">Model</dt>
                  <dd className="truncate font-mono text-xs">{quote.model}</dd>
                </div>
              </dl>
              {usage && (
                <dl className="mt-3 space-y-1.5 border-t border-line/70 pt-3 text-[13px]">
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted">Price list sent</dt>
                    <dd className="num">{usage.items_offered} of {usage.items_total} items</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted">Tokens in / out</dt>
                    <dd className="num">{usage.usage.input.toLocaleString("en-GB")} / {usage.usage.output.toLocaleString("en-GB")}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted">Read from cache</dt>
                    <dd className="num">{usage.usage.input ? Math.round((usage.usage.cached / usage.usage.input) * 100) : 0}%</dd>
                  </div>
                </dl>
              )}
            </Card>
          </aside>
        </div>
      )}
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

function OutcomeBanner({ outcome, status, reason }: { outcome: string; status: string; reason?: string }) {
  if (status === "approved") {
    return (
      <div className="mb-4 flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
        <Lock className="mt-0.5 size-4 shrink-0" aria-hidden />
        <div>
          <strong className="font-semibold">Approved and locked.</strong> This version can be sent to the customer. It can no longer be edited.
        </div>
      </div>
    );
  }
  if (outcome === "needs_site_visit") {
    return (
      <div className="mb-4 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
        <MapPin className="mt-0.5 size-4 shrink-0 text-amber-700" aria-hidden />
        <div>
          <strong className="font-semibold">Not priced: this job needs a site visit.</strong>
          {reason && <span className="text-amber-900"> {reason}</span>}
          <div className="mt-1 text-[13px] text-amber-800">Approve to confirm a “we&apos;ll come and have a look” reply. To price it after the visit, add lines below.</div>
        </div>
      </div>
    );
  }
  if (outcome === "cannot_quote") {
    return (
      <div className="mb-4 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
        <Ban className="mt-0.5 size-4 shrink-0" aria-hidden />
        <div>
          <strong className="font-semibold">Nothing here could be priced from your list.</strong>
          {reason && <span> {reason}</span>}
        </div>
      </div>
    );
  }
  return null;
}

/**
 * Security warnings always show in full. Everything else is one collapsible
 * "Check before approving" list, so the quote itself stays the focus.
 */
function Checks({ flags }: { flags: Flag[] }) {
  if (!flags.length) return null;
  const danger = flags.filter((f) => f.level === "danger");
  const rest = flags.filter((f) => f.level !== "danger").sort((a, b) => (a.level === b.level ? 0 : a.level === "warning" ? -1 : 1));
  return (
    <div className="no-print mb-5 space-y-2">
      {danger.map((f, i) => (
        <div key={i} className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[13px] leading-relaxed text-red-900">
          <ShieldAlert className="mt-0.5 size-4 shrink-0 text-red-600" aria-hidden />
          <span>
            <strong className="font-semibold">Security check: </strong>
            {f.message}
          </span>
        </div>
      ))}
      {rest.length > 0 && (
        <details open className="card group">
          <summary className="flex cursor-pointer list-none items-center gap-2 px-5 py-3 text-sm font-semibold">
            <TriangleAlert className="size-4 text-amber-600" aria-hidden /> Check before approving
            <span className="rounded-full bg-amber-100 px-2 text-xs font-medium text-amber-900 num">{rest.length}</span>
            <span className="ml-auto text-xs font-normal text-muted group-open:hidden">Show</span>
            <span className="ml-auto hidden text-xs font-normal text-muted group-open:inline">Hide</span>
          </summary>
          <ul className="divide-y divide-line/70 border-t border-line/70">
            {rest.map((f, i) => {
              const code = f.message.match(/^([A-Z][A-Z0-9_-]{1,19}):\s*/);
              return (
                <li key={i} className="flex items-start gap-3 px-5 py-2.5 text-[13px] leading-relaxed text-ink-2">
                  {f.level === "warning" ? (
                    <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-600" aria-hidden />
                  ) : (
                    <Info className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />
                  )}
                  <span>
                    {code && <span className="mr-1.5 font-mono text-xs font-medium text-ink">{code[1]}</span>}
                    {code ? f.message.slice(code[0].length) : f.message}
                  </span>
                </li>
              );
            })}
          </ul>
        </details>
      )}
    </div>
  );
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
