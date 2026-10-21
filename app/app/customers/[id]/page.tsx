import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { FileText, History as HistoryIcon, Inbox, Lock, Plus, UserRound } from "lucide-react";
import { getTenant } from "@/lib/tenant";
import { formatGBP } from "@/lib/quote/money";
import { Badge, Card, EmptyState, LinkButton, Skeleton } from "@/components/ui";
import { OutcomeBadge, StatusBadge, initials, timeAgo } from "@/components/status";
import { History } from "@/components/history";
import { CustomerArchiveButton, CustomerForm, type CustomerFormValues } from "../customer-form";

export const metadata: Metadata = { title: "Customer" };

export default async function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { supabase, company, can } = await getTenant();

  const { data: c } = await supabase.from("customers").select("*").eq("id", id).maybeSingle();
  if (!c) notFound();

  const [{ data: quotes }, { data: tagRows }] = await Promise.all([
    supabase.from("quotes").select("id, summary, outcome, status, total, created_at").eq("customer_id", id).order("created_at", { ascending: false }).limit(100),
    supabase.from("customers").select("tags").eq("company_id", company.id).is("archived_at", null),
  ]);
  const list = quotes ?? [];
  const approved = list.filter((q) => q.status === "approved");
  const approvedValue = approved.reduce((s, q) => s + Number(q.total), 0);
  const tagSuggestions = [...new Set((tagRows ?? []).flatMap((r) => r.tags as string[]))].sort();
  const archived = c.archived_at != null;
  const editable = can("customer.edit") && !archived;

  const initial: CustomerFormValues = {
    name: c.name,
    company_name: c.company_name ?? "",
    emails: (c.emails as string[]).join(", "),
    phones: (c.phones as string[]).join(", "),
    address: c.address ?? "",
    postcode: c.postcode ?? "",
    invoice_email: c.invoice_email ?? "",
    payment_terms: c.payment_terms ?? "",
    tags: (c.tags as string[]).join(", "),
    notes: c.notes ?? "",
  };

  return (
    <div className="animate-rise">
      <nav className="mb-4 text-[13px] text-muted">
        <Link href="/app/customers" className="hover:text-ink">Customers</Link>
        <span className="mx-1.5">/</span>
        <span className="text-ink-2">{c.name}</span>
      </nav>

      <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-start">
        <div className="flex min-w-0 flex-1 items-start gap-4">
          <div className="grid size-14 shrink-0 place-items-center rounded-2xl bg-brand-soft text-lg font-semibold text-brand-ink">{initials(c.name)}</div>
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight">{c.name}</h1>
            {c.company_name && <div className="text-ink-2">{c.company_name}</div>}
            <div className="mt-2 flex flex-wrap gap-1.5">
              {archived && <Badge tone="neutral" dot>Archived</Badge>}
              {(c.tags as string[]).map((t) => (
                <Badge key={t} tone="brand" className="capitalize">{t}</Badge>
              ))}
              {(c.merged_from as unknown[]).length > 1 && <Badge tone="info">Merged from {(c.merged_from as unknown[]).length} rows</Badge>}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!archived && (
            <LinkButton href={`/app/quotes/new?customer=${c.id}`}>
              <Plus className="size-4" /> New quote
            </LinkButton>
          )}
          {can("customer.edit") && <CustomerArchiveButton id={c.id} version={c.version} archived={archived} name={c.name} />}
        </div>
      </div>

      {/* Summary buttons, Odoo-style. */}
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Link href={`/app/quotes?customer=${c.id}`} className="card px-4 py-3 transition hover:border-line-strong">
          <div className="flex items-center gap-1.5 text-[13px] text-muted"><FileText className="size-3.5" /> Quotes</div>
          <div className="mt-1 text-xl font-semibold num">{list.length}</div>
        </Link>
        <div className="card px-4 py-3">
          <div className="text-[13px] text-muted">Approved</div>
          <div className="mt-1 text-xl font-semibold num">{approved.length}</div>
        </div>
        <div className="card px-4 py-3">
          <div className="text-[13px] text-muted">Approved value</div>
          <div className="mt-1 text-xl font-semibold num">{formatGBP(approvedValue)}</div>
        </div>
        <div className="card px-4 py-3">
          <div className="text-[13px] text-muted">Last quote</div>
          <div className="mt-1 text-xl font-semibold">{list[0] ? timeAgo(list[0].created_at) : "-"}</div>
        </div>
      </div>

      {archived && (
        <div className="mb-5 flex items-start gap-3 rounded-xl border border-line bg-sunken px-4 py-3 text-sm text-ink-2">
          <Lock className="mt-0.5 size-4 shrink-0" />
          Archived. Not matched to new enquiries. Restore to edit.
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
        <div className="min-w-0 space-y-5">
          <Card title="Quotes" icon={FileText} bodyClassName="p-0">
            {list.length === 0 ? (
              <EmptyState icon={Inbox} title="No quotes yet" />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px]">
                  <thead>
                    <tr>
                      <th className="th">Job</th>
                      <th className="th">Outcome</th>
                      <th className="th">Status</th>
                      <th className="th text-right">Total inc VAT</th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((q) => (
                      <tr key={q.id} className="relative transition hover:bg-sunken/40">
                        <td className="td">
                          <Link href={`/app/quotes/${q.id}`} className="line-clamp-1 rounded outline-none after:absolute after:inset-0 focus-visible:ring-2 focus-visible:ring-brand">
                            {q.summary ?? "Untitled"}
                          </Link>
                          <div className="text-xs text-muted">{timeAgo(q.created_at)}</div>
                        </td>
                        <td className="td"><OutcomeBadge outcome={q.outcome} /></td>
                        <td className="td"><StatusBadge status={q.status} /></td>
                        <td className="td text-right num">{q.outcome === "quote" ? formatGBP(Number(q.total)) : "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <Card title="Details" icon={UserRound}>
            <CustomerForm mode="edit" id={c.id} version={c.version} initial={initial} readOnly={!editable} tagSuggestions={tagSuggestions} />
          </Card>
        </div>

        <aside>
          <Card title="History" icon={HistoryIcon} className="lg:sticky lg:top-8">
            <Suspense fallback={<div className="space-y-2"><Skeleton className="h-4 w-3/4" /><Skeleton className="h-4 w-2/3" /></div>}>
              <History entity="customer" entityId={c.id} path={`/app/customers/${c.id}`} />
            </Suspense>
          </Card>
        </aside>
      </div>
    </div>
  );
}
