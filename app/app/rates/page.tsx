import type { Metadata } from "next";
import { Download, Plus, Upload } from "lucide-react";
import { getTenant } from "@/lib/tenant";
import { formatGBP } from "@/lib/quote/money";
import { needsReview, reviewCutoff } from "@/lib/rates";
import { LinkButton, PageHeader, Stat } from "@/components/ui";
import { FilterTabs, Pager, SearchBox, SelectFilter } from "@/components/list-controls";
import { RatesTable, type RateRow } from "./table";

export const metadata: Metadata = { title: "Price list" };

const PAGE_SIZE = 50;
const VIEWS = ["active", "review", "attention", "archived", "all"] as const;
type View = (typeof VIEWS)[number];

export default async function RatesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; view?: string; category?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const view: View = VIEWS.includes(sp.view as View) ? (sp.view as View) : "active";
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
  const q = (sp.q ?? "").trim().slice(0, 100);
  const { supabase, company, can } = await getTenant();
  const cutoff = reviewCutoff(company.price_review_months).toISOString();

  let query = supabase
    .from("rates_current")
    .select("id, code, item, category, unit, unit_raw, rate_ex_vat, price_since, next_price, next_price_from, status, notes, import_notes, modifiers, last_reviewed_at", { count: "exact" })
    .eq("company_id", company.id);
  if (view === "active") query = query.eq("status", "active");
  if (view === "review") {
    query = query
      .eq("status", "active")
      .or(`last_reviewed_at.is.null,last_reviewed_at.lt.${cutoff}`)
      .or(`price_since.is.null,price_since.lt.${cutoff.slice(0, 10)}`);
  }
  if (view === "attention") query = query.in("status", ["price_on_request", "not_offered"]);
  if (view === "archived") query = query.eq("status", "archived");
  if (sp.category) query = query.eq("category", sp.category.slice(0, 60));
  if (q) {
    const safe = q.replace(/[%,()*\\]/g, " ");
    query = query.or(`code.ilike.%${safe}%,item.ilike.%${safe}%,notes.ilike.%${safe}%,category.ilike.%${safe}%`);
  }

  const [{ data, count }, counts, { data: cats }] = await Promise.all([
    query.order("category", { nullsFirst: false }).order("code").range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1),
    Promise.all(
      (["active", "price_on_request", "not_offered", "archived"] as const).map((s) =>
        supabase.from("rates").select("id", { count: "exact", head: true }).eq("company_id", company.id).eq("status", s),
      ),
    ),
    supabase.from("rates").select("category").eq("company_id", company.id).not("category", "is", null),
  ]);
  const [active, por, notOffered, archived] = counts.map((c) => c.count ?? 0);
  const rows = (data ?? []).map((r) => ({
    ...r,
    rate_ex_vat: r.rate_ex_vat == null ? null : Number(r.rate_ex_vat),
    next_price: r.next_price == null ? null : Number(r.next_price),
    needs_review: needsReview(r, company.price_review_months),
  })) as RateRow[];
  const categories = [...new Set((cats ?? []).map((c) => c.category as string))].sort();
  const editable = can("rate.edit");

  return (
    <div className="animate-rise">
      <PageHeader
        title="Price list"
        description={`All prices ex VAT. Only items in use with a current price are offered to the AI. Prices not reviewed for ${company.price_review_months} months are flagged.`}
        actions={
          <>
            {can("data.export") && (
              // A file download, not a page: a plain link is correct here.
              // eslint-disable-next-line @next/next/no-html-link-for-pages
              <a href="/app/rates/export" className="inline-flex h-10 items-center gap-2 rounded-lg px-3 text-sm text-ink-2 hover:bg-sunken hover:text-ink">
                <Download className="size-4" /> Export
              </a>
            )}
            {can("data.import") && (
              <LinkButton href="/app/rates/import" variant="secondary">
                <Upload className="size-4" /> Import
              </LinkButton>
            )}
            {editable && (
              <LinkButton href="/app/rates/new">
                <Plus className="size-4" /> New item
              </LinkButton>
            )}
          </>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="In use" value={active} tone="success" href="/app/rates" />
        <Stat label="No price / not offered" value={por + notOffered} tone="warning" href="/app/rates?view=attention" />
        <Stat label="Archived" value={archived} tone="neutral" href="/app/rates?view=archived" />
        <Stat label="Minimum charge" value={formatGBP(company.min_charge)} hint={`VAT ${company.vat_rate * 100}% added on top`} tone="brand" />
      </div>

      <div className="card overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b border-line/70 px-4 py-3">
          <SearchBox placeholder="Search code, item, note" />
          <FilterTabs
            name="view"
            current={view}
            options={[
              { value: "active", label: "In use" },
              { value: "review", label: "Needs review" },
              { value: "attention", label: "No price / not offered" },
              { value: "archived", label: "Archived" },
              { value: "all", label: "All" },
            ]}
          />
          {categories.length > 0 && <SelectFilter name="category" label="All categories" options={categories} current={sp.category ?? ""} />}
        </div>
        <RatesTable rates={rows} editable={editable} reviewMonths={company.price_review_months} emptyHint={q || sp.category || view !== "active" ? "filters" : "none"} />
        <Pager page={page} pageSize={PAGE_SIZE} total={count ?? 0} />
      </div>
    </div>
  );
}
