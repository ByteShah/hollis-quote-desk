import Link from "next/link";
import { getTenant } from "@/lib/tenant";
import { formatGBP } from "@/lib/quote/money";
import { OutcomeBadge, StatusBadge } from "./badges";

export default async function QuotesPage() {
  const { supabase, company } = await getTenant();
  const { data: quotes } = await supabase
    .from("quotes")
    .select("id, summary, outcome, status, total, created_at, customers(name)")
    .eq("company_id", company.id)
    .order("created_at", { ascending: false })
    .limit(100);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Quotes</h1>
        <Link href="/app/quotes/new" className="btn-primary">New quote</Link>
      </div>
      <div className="card overflow-x-auto p-0">
        <table className="w-full">
          <thead>
            <tr>
              <th className="th">Created</th>
              <th className="th">Customer</th>
              <th className="th">Job</th>
              <th className="th">Outcome</th>
              <th className="th">Status</th>
              <th className="th text-right">Total inc VAT</th>
            </tr>
          </thead>
          <tbody>
            {quotes?.map((q) => (
              <tr key={q.id} className="hover:bg-stone-50">
                <td className="td whitespace-nowrap text-stone-500">{new Date(q.created_at).toLocaleDateString("en-GB")}</td>
                <td className="td">{(q.customers as unknown as { name: string } | null)?.name ?? <span className="text-stone-400">Unknown</span>}</td>
                <td className="td">
                  <Link href={`/app/quotes/${q.id}`} className="hover:underline">{q.summary ?? "Untitled"}</Link>
                </td>
                <td className="td"><OutcomeBadge outcome={q.outcome} /></td>
                <td className="td"><StatusBadge status={q.status} /></td>
                <td className="td text-right tabular-nums">{q.outcome === "quote" ? formatGBP(Number(q.total)) : "-"}</td>
              </tr>
            ))}
            {!quotes?.length && (
              <tr>
                <td className="td text-stone-500" colSpan={6}>No quotes yet. Paste an enquiry to start.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
