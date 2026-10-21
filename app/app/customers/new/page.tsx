import Link from "next/link";
import type { Metadata } from "next";
import { getTenant } from "@/lib/tenant";
import { senderEmail, senderName } from "@/lib/customers/match";
import { Card, PageHeader } from "@/components/ui";
import { CustomerForm, type CustomerFormValues } from "../customer-form";

export const metadata: Metadata = { title: "New customer" };

export default async function NewCustomerPage({ searchParams }: { searchParams: Promise<{ from_quote?: string }> }) {
  const { from_quote } = await searchParams;
  const { supabase, company } = await getTenant();

  // Pre-fill from an unmatched quote's email headers.
  let fromQuoteId: string | null = null;
  const initial: CustomerFormValues = { name: "", company_name: "", emails: "", phones: "", address: "", postcode: "", invoice_email: "", payment_terms: "", tags: "", notes: "" };
  if (from_quote && /^[0-9a-f-]{36}$/i.test(from_quote)) {
    const { data: q } = await supabase.from("quotes").select("id, enquiry_text, customer_id").eq("id", from_quote).maybeSingle();
    if (q && !q.customer_id) {
      fromQuoteId = q.id;
      initial.name = senderName(q.enquiry_text) ?? "";
      initial.emails = senderEmail(q.enquiry_text) ?? "";
    }
  }
  const { data: tagRows } = await supabase.from("customers").select("tags").eq("company_id", company.id).is("archived_at", null);
  const tags = [...new Set((tagRows ?? []).flatMap((r) => r.tags as string[]))].sort();

  return (
    <div className="max-w-3xl animate-rise">
      <PageHeader
        eyebrow={<Link href="/app/customers" className="hover:text-ink">Customers</Link>}
        title="New customer"
        description={fromQuoteId ? "Filled in from the enquiry. Saving links this customer to the quote." : "We'll warn you if someone already has the same email or phone number."}
      />
      <Card>
        <CustomerForm mode="create" initial={initial} fromQuoteId={fromQuoteId} readOnly={false} tagSuggestions={tags} />
      </Card>
    </div>
  );
}
