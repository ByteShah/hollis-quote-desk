import { getTenant } from "@/lib/tenant";

export default async function CustomersPage() {
  const { supabase, company } = await getTenant();
  const { data: customers } = await supabase
    .from("customers")
    .select("id, name, company_name, emails, phones, address, notes, invoice_email, payment_terms, merged_from")
    .eq("company_id", company.id)
    .order("name");

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Customers</h1>
      <div className="card overflow-x-auto p-0">
        <table className="w-full">
          <thead>
            <tr>
              <th className="th">Name</th>
              <th className="th">Contact</th>
              <th className="th">Address</th>
              <th className="th">Notes</th>
            </tr>
          </thead>
          <tbody>
            {customers?.map((c) => (
              <tr key={c.id}>
                <td className="td">
                  <div className="font-medium">{c.name}</div>
                  {c.company_name && <div className="text-stone-500">{c.company_name}</div>}
                  {(c.merged_from as unknown[]).length > 1 && (
                    <div className="text-xs text-stone-400">merged from {(c.merged_from as unknown[]).length} rows</div>
                  )}
                </td>
                <td className="td">
                  {c.emails.map((e: string) => <div key={e}>{e}</div>)}
                  {c.phones.map((p: string) => <div key={p} className="text-stone-500">{p}</div>)}
                </td>
                <td className="td">{c.address}</td>
                <td className="td text-stone-600">
                  {c.notes}
                  {c.payment_terms && <div>Terms: {c.payment_terms}</div>}
                  {c.invoice_email && <div>Invoices to: {c.invoice_email}</div>}
                </td>
              </tr>
            ))}
            {!customers?.length && (
              <tr>
                <td className="td text-stone-500" colSpan={4}>No customers yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
