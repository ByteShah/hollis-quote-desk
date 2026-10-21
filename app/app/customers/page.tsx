import Link from "next/link";
import type { Metadata } from "next";
import { Download, Plus, Upload, Users } from "lucide-react";
import { getTenant } from "@/lib/tenant";
import { formatGBP } from "@/lib/quote/money";
import { Badge, EmptyState, LinkButton, PageHeader } from "@/components/ui";
import { FilterTabs, Pager, SearchBox, SelectFilter } from "@/components/list-controls";
import { initials, timeAgo } from "@/components/status";

export const metadata: Metadata = { title: "Customers" };

const PAGE_SIZE = 50;

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; view?: string; tag?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const view = sp.view === "archived" ? "archived" : "active";
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
  const q = (sp.q ?? "").trim().toLowerCase().slice(0, 100);
  const { supabase, company, can } = await getTenant();

  let query = supabase
    .from("customers")
    .select("id, name, company_name, emails, phones, address, tags, payment_terms, archived_at", { count: "exact" })
    .eq("company_id", company.id);
  query = view === "archived" ? query.not("archived_at", "is", null) : query.is("archived_at", null);
  if (q) query = query.ilike("search_text", `%${q.replace(/[%_\\]/g, " ")}%`);
  if (sp.tag) query = query.contains("tags", [sp.tag.toLowerCase().slice(0, 30)]);

  const [{ data, count }, { data: tagRows }, { count: archivedCount }] = await Promise.all([
    query.order("name").range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1),
    supabase.from("customers").select("tags").eq("company_id", company.id).is("archived_at", null),
    supabase.from("customers").select("id", { count: "exact", head: true }).eq("company_id", company.id).not("archived_at", "is", null),
  ]);
  const customers = data ?? [];
  const tags = [...new Set((tagRows ?? []).flatMap((r) => r.tags as string[]))].sort();

  // Quote totals for the customers on this page only.
  const ids = customers.map((c) => c.id);
  const { data: quotes } = ids.length
    ? await supabase.from("quotes").select("customer_id, status, total, created_at").in("customer_id", ids)
    : { data: [] };
  const stats = new Map<string, { count: number; approved: number; last: string | null }>();
  for (const qr of quotes ?? []) {
    const s = stats.get(qr.customer_id!) ?? { count: 0, approved: 0, last: null };
    s.count += 1;
    if (qr.status === "approved") s.approved += Number(qr.total);
    if (!s.last || qr.created_at > s.last) s.last = qr.created_at;
    stats.set(qr.customer_id!, s);
  }

  return (
    <div className="animate-rise">
      <PageHeader
        title="Customers"
        description="Everyone who's asked for a quote. Matched automatically to new enquiries by email, phone or name and address."
        actions={
          <>
            {can("data.export") && (
              // A file download, not a page.
              // eslint-disable-next-line @next/next/no-html-link-for-pages
              <a href="/app/customers/export" className="inline-flex h-10 items-center gap-2 rounded-lg px-3 text-sm text-ink-2 hover:bg-sunken hover:text-ink">
                <Download className="size-4" /> Export
              </a>
            )}
            {can("data.import") && (
              <LinkButton href="/app/customers/import" variant="secondary">
                <Upload className="size-4" /> Import
              </LinkButton>
            )}
            <LinkButton href="/app/customers/new">
              <Plus className="size-4" /> New customer
            </LinkButton>
          </>
        }
      />

      <div className="card overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b border-line/70 px-4 py-3">
          <SearchBox placeholder="Search name, email, phone, address" />
          <FilterTabs
            name="view"
            current={view}
            options={[
              { value: "active", label: "Active" },
              { value: "archived", label: "Archived", count: archivedCount ?? 0 },
            ]}
          />
          {tags.length > 0 && <SelectFilter name="tag" label="All tags" options={tags} current={sp.tag ?? ""} />}
        </div>

        {customers.length === 0 ? (
          <EmptyState
            icon={Users}
            title={q || sp.tag || view === "archived" ? "No customers match" : "No customers yet"}
            action={!q && view === "active" && <LinkButton href="/app/customers/new" variant="secondary"><Plus className="size-4" /> Add a customer</LinkButton>}
          >
            {q || sp.tag ? "Try a different search or filter." : view === "active" ? "Add them one by one, import a CSV, or save them from a quote." : null}
          </EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px]">
              <thead>
                <tr>
                  <th className="th">Customer</th>
                  <th className="th">Contact</th>
                  <th className="th">Tags</th>
                  <th className="th text-right">Quotes</th>
                  <th className="th text-right">Approved</th>
                  <th className="th text-right">Last quote</th>
                </tr>
              </thead>
              <tbody>
                {customers.map((c) => {
                  const s = stats.get(c.id);
                  return (
                    <tr key={c.id} className="group relative transition hover:bg-sunken/40">
                      <td className="td">
                        <div className="flex items-center gap-3">
                          <div className="grid size-9 shrink-0 place-items-center rounded-full bg-brand-soft text-xs font-semibold text-brand-ink">{initials(c.name)}</div>
                          <div className="min-w-0">
                            <Link href={`/app/customers/${c.id}`} className="block truncate rounded font-medium text-ink outline-none after:absolute after:inset-0 focus-visible:ring-2 focus-visible:ring-brand">
                              {c.name}
                            </Link>
                            {c.company_name && <div className="truncate text-[13px] text-muted">{c.company_name}</div>}
                          </div>
                        </div>
                      </td>
                      <td className="td text-[13px] text-ink-2">
                        <div className="max-w-[16rem] truncate">{(c.emails as string[])[0] ?? <span className="text-muted">No email</span>}</div>
                        <div className="text-muted">{(c.phones as string[])[0]}</div>
                      </td>
                      <td className="td">
                        <div className="flex flex-wrap gap-1">
                          {(c.tags as string[]).map((t) => (
                            <Badge key={t} tone="brand" className="text-[11px] capitalize">{t}</Badge>
                          ))}
                          {c.payment_terms && <Badge className="text-[11px]">{c.payment_terms}</Badge>}
                        </div>
                      </td>
                      <td className="td text-right num">{s?.count ?? 0}</td>
                      <td className="td text-right num">{s?.approved ? formatGBP(s.approved) : <span className="text-muted">-</span>}</td>
                      <td className="td whitespace-nowrap text-right text-[13px] text-muted">{s?.last ? timeAgo(s.last) : "-"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <Pager page={page} pageSize={PAGE_SIZE} total={count ?? 0} />
      </div>
    </div>
  );
}
