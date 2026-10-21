import Link from "next/link";
import type { Metadata } from "next";
import { ChevronRight, Inbox, Plus } from "lucide-react";
import { getTenant } from "@/lib/tenant";
import { formatGBP } from "@/lib/quote/money";
import { Card, EmptyState, LinkButton, PageHeader, Stat, cn } from "@/components/ui";
import { OutcomeBadge, StatusBadge, timeAgo } from "@/components/status";

export const metadata: Metadata = { title: "Quotes" };

const VIEWS = {
  all: { label: "All" },
  review: { label: "Awaiting review" },
  site_visit: { label: "Site visits" },
  approved: { label: "Approved" },
  rejected: { label: "Rejected" },
} as const;
type View = keyof typeof VIEWS;

type Row = {
  id: string;
  summary: string | null;
  outcome: string;
  status: string;
  total: number;
  created_at: string;
  flags: { level: string }[];
  customers: { name: string; company_name: string | null } | null;
};

export default async function QuotesPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const { view: rawView } = await searchParams;
  const view: View = rawView && rawView in VIEWS ? (rawView as View) : "all";
  const { supabase, company } = await getTenant();

  const { data } = await supabase
    .from("quotes")
    .select("id, summary, outcome, status, total, created_at, flags, customers(name, company_name)")
    .eq("company_id", company.id)
    .order("created_at", { ascending: false })
    .limit(200);
  const all = (data ?? []) as unknown as Row[];

  const counts = {
    review: all.filter((q) => q.status === "draft").length,
    site_visit: all.filter((q) => q.outcome === "needs_site_visit" && q.status === "draft").length,
    approved: all.filter((q) => q.status === "approved").length,
    approvedValue: all.filter((q) => q.status === "approved").reduce((s, q) => s + Number(q.total), 0),
  };

  const rows = all.filter((q) => {
    if (view === "review") return q.status === "draft";
    if (view === "site_visit") return q.outcome === "needs_site_visit";
    if (view === "approved") return q.status === "approved";
    if (view === "rejected") return q.status === "rejected";
    return true;
  });

  return (
    <div className="animate-rise">
      <PageHeader
        title="Quotes"
        description="Every draft waits here until someone at the company has checked it."
        actions={
          <LinkButton href="/app/quotes/new">
            <Plus className="size-4" /> New quote
          </LinkButton>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Awaiting review" value={counts.review} tone="info" href="/app/quotes?view=review" />
        <Stat label="Need a site visit" value={counts.site_visit} tone="warning" href="/app/quotes?view=site_visit" />
        <Stat label="Approved" value={counts.approved} tone="success" href="/app/quotes?view=approved" />
        <Stat label="Approved value" value={formatGBP(counts.approvedValue)} hint="inc VAT" tone="brand" />
      </div>

      <Card bodyClassName="p-0">
        <div className="flex gap-1 overflow-x-auto border-b border-line/70 px-3 pt-2">
          {(Object.keys(VIEWS) as View[]).map((v) => (
            <Link
              key={v}
              href={v === "all" ? "/app/quotes" : `/app/quotes?view=${v}`}
              className={cn(
                "-mb-px shrink-0 border-b-2 px-3 py-2.5 text-[13px] transition",
                v === view ? "border-brand font-medium text-ink" : "border-transparent text-muted hover:text-ink",
              )}
            >
              {VIEWS[v].label}
            </Link>
          ))}
        </div>

        {rows.length === 0 ? (
          <EmptyState
            icon={Inbox}
            title={view === "all" ? "No quotes yet" : `Nothing in “${VIEWS[view].label}”`}
            action={
              view === "all" && (
                <LinkButton href="/app/quotes/new" variant="secondary">
                  <Plus className="size-4" /> Draft your first quote
                </LinkButton>
              )
            }
          >
            {view === "all" ? "Paste a customer enquiry and you'll get a draft to check in under a minute." : null}
          </EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px]">
              <thead>
                <tr>
                  <th className="th">Customer &amp; job</th>
                  <th className="th">Outcome</th>
                  <th className="th">Status</th>
                  <th className="th text-right">Total inc VAT</th>
                  <th className="th text-right">Created</th>
                  <th className="th w-8" />
                </tr>
              </thead>
              <tbody>
                {rows.map((q) => {
                  const alerts = q.flags.filter((f) => f.level === "danger").length;
                  return (
                    <tr key={q.id} className="group relative transition hover:bg-sunken/50">
                      <td className="td max-w-[380px]">
                        <Link href={`/app/quotes/${q.id}`} className="after:absolute after:inset-0" aria-label={`Open quote: ${q.summary ?? "untitled"}`} />
                        <div className="font-medium text-ink">
                          {q.customers?.name ?? <span className="text-muted">Unknown customer</span>}
                          {q.customers?.company_name && <span className="font-normal text-muted"> · {q.customers.company_name}</span>}
                        </div>
                        <div className="mt-0.5 line-clamp-1 text-[13px] text-muted">{q.summary ?? "Untitled"}</div>
                      </td>
                      <td className="td">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <OutcomeBadge outcome={q.outcome} />
                          {alerts > 0 && <span className="size-2 rounded-full bg-red-500" title="Contains a security warning" />}
                        </div>
                      </td>
                      <td className="td"><StatusBadge status={q.status} /></td>
                      <td className="td text-right font-medium num">{q.outcome === "quote" ? formatGBP(Number(q.total)) : <span className="text-muted">-</span>}</td>
                      <td className="td whitespace-nowrap text-right text-[13px] text-muted">{timeAgo(q.created_at)}</td>
                      <td className="td text-muted"><ChevronRight className="size-4 transition group-hover:translate-x-0.5 group-hover:text-ink" /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
