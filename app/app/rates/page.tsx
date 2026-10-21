import type { Metadata } from "next";
import { getTenant } from "@/lib/tenant";
import { formatGBP } from "@/lib/quote/money";
import { PageHeader, Stat } from "@/components/ui";
import { RatesTable, type RateRow } from "./table";

export const metadata: Metadata = { title: "Price list" };

export default async function RatesPage() {
  const { supabase, company } = await getTenant();
  const { data } = await supabase
    .from("rates_current")
    .select("code, item, unit, unit_raw, rate_ex_vat, status, notes, import_notes, modifiers")
    .eq("company_id", company.id)
    .order("code");
  const rates = (data ?? []).map((r) => ({ ...r, rate_ex_vat: r.rate_ex_vat == null ? null : Number(r.rate_ex_vat) })) as RateRow[];
  const count = (s: string) => rates.filter((r) => r.status === s).length;

  return (
    <div className="animate-rise">
      <PageHeader
        title="Price list"
        description={
          <>
            All prices ex VAT. Only rates marked <strong className="font-medium text-ink-2">In use</strong> are offered to the AI. The
            notes show every change made when the list was imported.
          </>
        }
      />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="In use" value={count("active")} tone="success" />
        <Stat label="No price yet" value={count("price_on_request")} tone="warning" hint="Flagged for pricing by hand" />
        <Stat label="Not offered" value={count("not_offered")} tone="danger" />
        <Stat label="Minimum charge" value={formatGBP(company.min_charge)} hint={`VAT ${company.vat_rate * 100}% added on top`} tone="brand" />
      </div>
      <RatesTable rates={rates} />
    </div>
  );
}
