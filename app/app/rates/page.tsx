import { getTenant } from "@/lib/tenant";
import { formatGBP } from "@/lib/quote/money";

const STATUS_STYLE: Record<string, string> = {
  active: "bg-emerald-50 text-emerald-800",
  superseded: "bg-stone-100 text-stone-500",
  price_on_request: "bg-amber-50 text-amber-800",
  not_offered: "bg-red-50 text-red-800",
};
const STATUS_LABEL: Record<string, string> = {
  active: "In use",
  superseded: "Superseded",
  price_on_request: "No price",
  not_offered: "Not offered",
};

export default async function RatesPage() {
  const { supabase, company } = await getTenant();
  const { data: rates } = await supabase
    .from("rates")
    .select("code, item, unit, unit_raw, rate_ex_vat, status, notes, import_notes, modifiers")
    .eq("company_id", company.id)
    .order("code");

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Rates</h1>
        <p className="text-sm text-stone-500">
          All prices ex VAT. Only rates marked &ldquo;In use&rdquo; are offered to the AI. Minimum charge{" "}
          {formatGBP(company.min_charge)}, VAT {company.vat_rate * 100}%.
        </p>
      </div>
      <div className="card overflow-x-auto p-0">
        <table className="w-full">
          <thead>
            <tr>
              <th className="th">Code</th>
              <th className="th">Item</th>
              <th className="th">Unit</th>
              <th className="th text-right">Rate</th>
              <th className="th">Status</th>
              <th className="th">Notes / import decisions</th>
            </tr>
          </thead>
          <tbody>
            {rates?.map((r) => (
              <tr key={r.code}>
                <td className="td font-mono">{r.code}</td>
                <td className="td">{r.item}</td>
                <td className="td">
                  {r.unit}
                  {r.unit_raw && r.unit_raw !== r.unit && <span className="text-stone-400"> ({r.unit_raw})</span>}
                </td>
                <td className="td text-right tabular-nums">{r.rate_ex_vat == null ? "-" : formatGBP(Number(r.rate_ex_vat))}</td>
                <td className="td">
                  <span className={`rounded px-2 py-0.5 text-xs ${STATUS_STYLE[r.status]}`}>{STATUS_LABEL[r.status]}</span>
                </td>
                <td className="td text-xs text-stone-600">
                  {r.notes && <div>{r.notes}</div>}
                  {r.import_notes && <div className="text-stone-400">{r.import_notes}</div>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
