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
  MapPin,
  ShieldAlert,
  TriangleAlert,
  UserRound,
} from "lucide-react";
import { getTenant } from "@/lib/tenant";
import type { Exclusion, Flag, QuoteLine } from "@/lib/quote/build";
import type { CustomerMatch } from "@/lib/customers/match";
import { Badge, Card, Skeleton, cn } from "@/components/ui";
import { OutcomeBadge, StatusBadge, timeAgo } from "@/components/status";
import { ReviewActions, CustomerPicker } from "./review-actions";
import { QuotePreview } from "./preview";
import { History } from "@/components/history";

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

  const [{ data: lineRows }, { data: rates }, { data: customers }] = await Promise.all([
    supabase.from("quote_lines").select("*").eq("quote_id", id).order("position"),
    supabase.from("rates_current").select("code, item, unit, rate_ex_vat").eq("company_id", company.id).eq("status", "active").order("code"),
    supabase
      .from("customers")
      .select("id, name, company_name, address, notes, invoice_email, payment_terms, emails, phones")
      .eq("company_id", company.id)
      .is("archived_at", null)
      .order("name"),
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
  const flags = quote.flags as Flag[];
  const exclusions = quote.exclusions as Exclusion[];
  const editable = quote.status !== "approved";
  const preview = tab === "preview";
  const totals = { subtotal: Number(quote.subtotal), vat: Number(quote.vat), total: Number(quote.total) };

  return (
    <div className="animate-rise">
      <nav className="no-print mb-4 text-[13px] text-muted">
        <Link href="/app/quotes" className="hover:text-ink">Quotes</Link>
        <span className="mx-1.5">/</span>
        <span className="text-ink-2">{customer?.name ?? "Unknown customer"}</span>
      </nav>

      <div className="no-print mb-5 flex flex-col gap-4 lg:flex-row lg:items-start">
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex flex-wrap gap-1.5">
            <OutcomeBadge outcome={quote.outcome} />
            <StatusBadge status={quote.status} />
          </div>
          <h1 className="text-xl font-semibold leading-snug tracking-tight sm:text-2xl">{quote.summary ?? "Draft quote"}</h1>
          <p className="mt-1 text-[13px] text-muted">
            Drafted {timeAgo(quote.created_at)}
            {quote.approved_at && <> · approved {timeAgo(quote.approved_at)} by {quote.approved_by_email ?? "a team member"}</>}
          </p>
        </div>
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

      <div className="no-print mb-5 inline-flex rounded-lg bg-sunken p-1 ring-1 ring-line">
        {[
          { key: "review", label: "Review", icon: ListChecks, href: `/app/quotes/${id}` },
          { key: "preview", label: "Customer preview", icon: FileText, href: `/app/quotes/${id}?tab=preview` },
        ].map(({ key, label, icon: Icon, href }) => {
          const active = (key === "preview") === preview;
          return (
            <Link
              key={key}
              href={href}
              replace
              scroll={false}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[13px] transition",
                active ? "bg-surface font-medium text-ink shadow-(--shadow-card)" : "text-muted hover:text-ink",
              )}
            >
              <Icon className="size-3.5" aria-hidden /> {label}
            </Link>
          );
        })}
      </div>

      {preview ? (
        <QuotePreview company={company} quote={quote} customer={customer} lines={lines} exclusions={exclusions} totals={totals} />
      ) : (
        <>
          <OutcomeBanner outcome={quote.outcome} status={quote.status} reason={meta.outcome_reason} />
          <Flags flags={flags} />

          <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
            <div className="min-w-0 space-y-5">
              <Card title="Line items" icon={ClipboardList} action={<span className="text-xs text-muted">All prices ex VAT</span>}>
                <LinesEditor
                  quoteId={id}
                  editable={editable}
                  initial={lines}
                  rates={(rates ?? []).map((r) => ({ ...r, rate_ex_vat: Number(r.rate_ex_vat) }))}
                  pricing={{ vat_rate: company.vat_rate, min_charge: company.min_charge }}
                  saved={totals}
                />
              </Card>

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

              <div className="grid gap-5 md:grid-cols-2">
                <ListCard title="Assumptions made" icon={Info} items={quote.assumptions as string[]} />
                <ListCard title="Questions for the customer" icon={CircleHelp} items={quote.questions as string[]} />
              </div>

              <details className="card group">
                <summary className="flex cursor-pointer list-none items-center gap-2 px-5 py-3.5 text-sm font-semibold">
                  <FileText className="size-4 text-muted" aria-hidden /> Original enquiry
                  <span className="ml-auto text-xs font-normal text-muted group-open:hidden">Show</span>
                  <span className="ml-auto hidden text-xs font-normal text-muted group-open:inline">Hide</span>
                </summary>
                <pre className="max-h-[28rem] overflow-auto whitespace-pre-wrap border-t border-line/70 bg-sunken/40 px-5 py-4 font-mono text-xs leading-relaxed text-ink-2">
                  {quote.enquiry_text}
                </pre>
              </details>
            </div>

            <aside className="space-y-5">
              <Card title="Customer" icon={UserRound}>
                {customer ? (
                  <div className="space-y-3 text-sm">
                    <div>
                      <div className="font-medium">{customer.name}</div>
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
                  <p className="text-sm text-muted">Not matched to anyone in your customer list.</p>
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
                {meta.outcome_reason && <p className="mt-3 border-t border-line/70 pt-3 text-[13px] leading-relaxed text-ink-2">{meta.outcome_reason}</p>}
              </Card>

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
            </aside>
          </div>
        </>
      )}
    </div>
  );
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

function Flags({ flags }: { flags: Flag[] }) {
  if (!flags.length) return null;
  const order = { danger: 0, warning: 1, info: 2 } as const;
  const sorted = [...flags].sort((a, b) => order[a.level] - order[b.level]);
  const STYLE = {
    danger: { box: "border-red-200 bg-red-50 text-red-900", icon: ShieldAlert, iconCls: "text-red-600" },
    warning: { box: "border-amber-200 bg-amber-50/70 text-amber-950", icon: TriangleAlert, iconCls: "text-amber-600" },
    info: { box: "border-line bg-surface text-ink-2", icon: Info, iconCls: "text-muted" },
  };
  return (
    <ul className="mb-5 space-y-2">
      {sorted.map((f, i) => {
        const s = STYLE[f.level];
        return (
          <li key={i} className={cn("flex items-start gap-3 rounded-xl border px-4 py-2.5 text-[13px] leading-relaxed", s.box)}>
            <s.icon className={cn("mt-0.5 size-4 shrink-0", s.iconCls)} aria-hidden />
            <span>
              {f.level === "danger" && <strong className="font-semibold">Security check: </strong>}
              {f.message}
            </span>
          </li>
        );
      })}
    </ul>
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
