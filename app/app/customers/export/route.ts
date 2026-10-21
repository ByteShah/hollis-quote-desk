import { getTenant } from "@/lib/tenant";
import { csvResponse, toCsv } from "@/lib/csv";

// Customer export, in the same columns the importer reads.
export async function GET() {
  const t = await getTenant();
  if (!t.can("data.export")) return new Response("Not allowed", { status: 403 });
  const { data } = await t.supabase
    .from("customers")
    .select("name, company_name, emails, phones, address, postcode, invoice_email, payment_terms, tags, notes, archived_at")
    .eq("company_id", t.company.id)
    .order("name");
  const rows = (data ?? []).map((c) => [
    c.name, c.company_name, c.emails, c.phones, c.address, c.postcode, c.invoice_email, c.payment_terms, c.tags, c.notes,
    c.archived_at ? "yes" : "",
  ]);
  const body = toCsv(["Name", "Company", "Email", "Phone", "Address", "Postcode", "Invoice email", "Payment terms", "Tags", "Notes", "Archived"], rows);
  return csvResponse(`${t.company.slug}-customers-${new Date().toISOString().slice(0, 10)}.csv`, body);
}
