import { getTenant } from "@/lib/tenant";
import { csvResponse, toCsv } from "@/lib/csv";

// Price list export, in the same columns the importer reads.
export async function GET() {
  const t = await getTenant();
  if (!t.can("data.export")) return new Response("Not allowed", { status: 403 });
  const { data } = await t.supabase
    .from("rates_current")
    .select("code, item, category, unit, rate_ex_vat, price_since, next_price, next_price_from, status, notes, last_reviewed_at")
    .eq("company_id", t.company.id)
    .order("code");
  const rows = (data ?? []).map((r) => [
    r.code, r.item, r.category, r.unit, r.rate_ex_vat, r.price_since, r.next_price, r.next_price_from, r.status, r.notes,
    r.last_reviewed_at?.slice(0, 10),
  ]);
  const body = toCsv(
    ["Code", "Item", "Category", "Unit", "Price ex VAT", "Price since", "Next price", "Next price from", "Status", "Notes", "Last reviewed"],
    rows,
  );
  return csvResponse(`${t.company.slug}-price-list-${new Date().toISOString().slice(0, 10)}.csv`, body);
}
