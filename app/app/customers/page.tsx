import type { Metadata } from "next";
import { Building2, GitMerge, Mail, MapPin, Phone, Users } from "lucide-react";
import { getTenant } from "@/lib/tenant";
import { Badge, EmptyState, PageHeader } from "@/components/ui";
import { initials } from "@/components/status";

export const metadata: Metadata = { title: "Customers" };

export default async function CustomersPage() {
  const { supabase, company } = await getTenant();
  const { data: customers } = await supabase
    .from("customers")
    .select("id, name, company_name, emails, phones, address, notes, invoice_email, payment_terms, merged_from")
    .eq("company_id", company.id)
    .order("name");

  const merged = customers?.filter((c) => (c.merged_from as unknown[]).length > 1).length ?? 0;

  return (
    <div className="animate-rise">
      <PageHeader
        title="Customers"
        description={
          customers?.length
            ? `${customers.length} customers. Duplicates in the imported list were merged (${merged}); the original rows are kept on each record.`
            : undefined
        }
      />
      {!customers?.length ? (
        <div className="card">
          <EmptyState icon={Users} title="No customers yet" />
        </div>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {customers.map((c) => {
            const rows = (c.merged_from as { why: string }[]).length;
            return (
              <li key={c.id} className="card flex flex-col p-5">
                <div className="flex items-start gap-3">
                  <div className="grid size-10 shrink-0 place-items-center rounded-full bg-brand-soft text-sm font-semibold text-brand-ink">
                    {initials(c.name)}
                  </div>
                  <div className="min-w-0">
                    <div className="truncate font-medium">{c.name}</div>
                    {c.company_name && (
                      <div className="flex items-center gap-1 truncate text-[13px] text-muted">
                        <Building2 className="size-3.5 shrink-0" aria-hidden /> {c.company_name}
                      </div>
                    )}
                  </div>
                  {rows > 1 && (
                    <Badge tone="info" className="ml-auto">
                      <GitMerge className="size-3" aria-hidden /> {rows} merged
                    </Badge>
                  )}
                </div>

                <ul className="mt-4 space-y-1.5 text-[13px] text-ink-2">
                  {c.emails.map((e: string) => (
                    <li key={e} className="flex items-center gap-2 truncate">
                      <Mail className="size-3.5 shrink-0 text-muted" aria-hidden /> {e}
                    </li>
                  ))}
                  {c.phones.map((p: string) => (
                    <li key={p} className="flex items-center gap-2">
                      <Phone className="size-3.5 shrink-0 text-muted" aria-hidden /> {p}
                    </li>
                  ))}
                  {c.address && (
                    <li className="flex items-start gap-2">
                      <MapPin className="mt-0.5 size-3.5 shrink-0 text-muted" aria-hidden /> {c.address}
                    </li>
                  )}
                </ul>

                {(c.notes || c.payment_terms || c.invoice_email) && (
                  <div className="mt-auto pt-4">
                    <div className="space-y-1 rounded-lg bg-sunken/70 px-3 py-2 text-xs text-ink-2">
                      {c.notes && <div>{c.notes}</div>}
                      {c.payment_terms && (
                        <div>
                          <span className="text-muted">Terms:</span> {c.payment_terms}
                        </div>
                      )}
                      {c.invoice_email && (
                        <div className="truncate">
                          <span className="text-muted">Invoices to:</span> {c.invoice_email}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
