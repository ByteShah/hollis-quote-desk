import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { FileText, History as HistoryIcon, ListOrdered, Lock } from "lucide-react";
import { getTenant } from "@/lib/tenant";
import { formatGBP } from "@/lib/quote/money";
import { needsReview, ukToday, unitLabel } from "@/lib/rates";
import { Badge, Card, Skeleton, cn } from "@/components/ui";
import { RateStatusBadge } from "@/components/status";
import { History } from "@/components/history";
import { RateForm, type RateFormValues } from "../rate-form";
import { ArchiveButton, PricePanel } from "../price-panel";
import { formatDate } from "@/lib/dates";

export const metadata: Metadata = { title: "Price list item" };

const STAGES = [
  { value: "active", label: "In use" },
  { value: "price_on_request", label: "No price" },
  { value: "not_offered", label: "Not offered" },
  { value: "archived", label: "Archived" },
];
const SOURCE: Record<string, string> = { seed: "Original list", manual: "Changed by hand", import: "CSV import" };

export default async function RatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { supabase, company, can } = await getTenant();

  const { data: r } = await supabase.from("rates_current").select("*").eq("id", id).maybeSingle();
  if (!r) notFound();

  const [{ data: prices }, { data: usage }, { data: cats }] = await Promise.all([
    supabase
      .from("rate_prices")
      .select("id, price_ex_vat, effective_from, reason, source, created_at")
      .eq("rate_id", id)
      .order("effective_from", { ascending: false })
      .order("created_at", { ascending: false }),
    supabase.from("quote_lines").select("quote_id").eq("company_id", company.id).eq("rate_code", r.code).limit(1000),
    supabase.from("rates").select("category").eq("company_id", company.id).not("category", "is", null),
  ]);
  const quoteCount = new Set((usage ?? []).map((u) => u.quote_id)).size;
  const categories = [...new Set((cats ?? []).map((c) => c.category as string))].sort();
  const editable = can("rate.edit");
  const archived = r.status === "archived";
  const today = ukToday();

  const initial: RateFormValues = {
    code: r.code,
    item: r.item,
    category: r.category ?? "",
    unit: r.unit,
    status: archived ? "active" : r.status,
    notes: r.notes ?? "",
    modifiers: (r.modifiers as { label: string; amount: number; per: "unit" | "flat" }[]).map(({ label, amount, per }) => ({ label, amount, per })),
    load_size: r.load_size == null ? "" : String(r.load_size),
    included_in: ((r.included_in as string[] | null) ?? []).join(", "),
    site_visit_reason: r.site_visit_reason ?? "",
  };

  return (
    <div className="animate-rise">
      <nav className="mb-4 text-[13px] text-muted">
        <Link href="/app/rates" className="hover:text-ink">Price list</Link>
        <span className="mx-1.5">/</span>
        <span className="font-mono text-ink-2">{r.code}</span>
      </nav>

      <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-start">
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="rounded-md bg-sunken px-2 py-0.5 font-mono text-xs ring-1 ring-line">{r.code}</span>
            <RateStatusBadge status={r.status} />
            {r.category && <Badge>{r.category}</Badge>}
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">{r.item}</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {quoteCount > 0 && (
            <Link href={`/app/quotes?rate=${encodeURIComponent(r.code)}`} className="card flex items-center gap-2 px-3 py-2 text-sm transition hover:border-line-strong">
              <FileText className="size-4 text-muted" />
              <span className="font-semibold num">{quoteCount}</span> quote{quoteCount === 1 ? "" : "s"}
            </Link>
          )}
          {editable && <ArchiveButton id={r.id} version={r.version} archived={archived} code={r.code} />}
        </div>
      </div>

      {/* Status bar, Odoo-style: where this item sits in its lifecycle. */}
      <ol className="mb-5 flex max-w-full overflow-x-auto rounded-lg bg-sunken p-1 text-[13px] ring-1 ring-line" aria-label="Status">
        {STAGES.map((s) => (
          <li
            key={s.value}
            aria-current={r.status === s.value ? "step" : undefined}
            className={cn("shrink-0 rounded-md px-3 py-1", r.status === s.value ? "bg-surface font-medium text-ink shadow-(--shadow-card)" : "text-muted")}
          >
            {s.label}
          </li>
        ))}
      </ol>

      {archived && (
        <div className="mb-5 flex items-start gap-3 rounded-xl border border-line bg-sunken px-4 py-3 text-sm text-ink-2">
          <Lock className="mt-0.5 size-4 shrink-0" />
          Archived {r.archived_at && formatDate(r.archived_at, "numeric")}. It isn&apos;t offered for new quotes. Restore it to edit.
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
        <div className="min-w-0 space-y-5">
          <PricePanel
            id={r.id}
            unit={r.unit}
            price={r.rate_ex_vat == null ? null : Number(r.rate_ex_vat)}
            priceSince={r.price_since}
            nextPrice={r.next_price == null ? null : Number(r.next_price)}
            nextPriceFrom={r.next_price_from}
            lastReviewed={r.last_reviewed_at}
            needsReview={needsReview(r, company.price_review_months)}
            reviewMonths={company.price_review_months}
            archived={archived}
            editable={editable}
          />

          <Card title="Details">
            <RateForm mode="edit" id={r.id} version={r.version} initial={initial} categories={categories} readOnly={!editable || archived} />
            {r.import_notes && (
              <p className="mt-5 rounded-lg bg-sunken/70 px-3 py-2 text-xs text-muted">
                <span className="font-medium text-ink-2">From the original import:</span> {r.import_notes}
              </p>
            )}
          </Card>

          <Card title="Price history" icon={ListOrdered} bodyClassName="p-0">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px]">
                <thead>
                  <tr>
                    <th className="th">Price</th>
                    <th className="th">From</th>
                    <th className="th">Reason</th>
                    <th className="th">Source</th>
                  </tr>
                </thead>
                <tbody>
                  {(prices ?? []).map((p, i, all) => {
                    const isCurrent = p.effective_from <= today && all.findIndex((x) => x.effective_from <= today) === i;
                    return (
                      <tr key={p.id} className={cn(isCurrent && "bg-brand-soft/30")}>
                        <td className="td font-medium num">
                          {formatGBP(Number(p.price_ex_vat))}
                          <span className="font-normal text-muted"> /{unitLabel(r.unit)}</span>
                        </td>
                        <td className="td whitespace-nowrap">
                          {formatDate(p.effective_from)}
                          {isCurrent && <Badge tone="success" className="ml-2 text-[11px]">Current</Badge>}
                          {p.effective_from > today && <Badge tone="info" className="ml-2 text-[11px]">Scheduled</Badge>}
                        </td>
                        <td className="td text-ink-2">{p.reason}</td>
                        <td className="td text-xs text-muted">{SOURCE[p.source] ?? p.source}</td>
                      </tr>
                    );
                  })}
                  {!prices?.length && (
                    <tr>
                      <td className="td py-6 text-center text-muted" colSpan={4}>No price set yet.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>

        <aside>
          <Card title="History" icon={HistoryIcon} className="lg:sticky lg:top-8">
            <Suspense fallback={<div className="space-y-2"><Skeleton className="h-4 w-3/4" /><Skeleton className="h-4 w-2/3" /></div>}>
              <History entity="rate" entityId={r.id} path={`/app/rates/${r.id}`} />
            </Suspense>
          </Card>
        </aside>
      </div>
    </div>
  );
}
