import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ChevronRight, History } from "lucide-react";
import { getTenant } from "@/lib/tenant";
import { Badge, EmptyState, LinkButton, PageHeader } from "@/components/ui";
import { timeAgo } from "@/components/status";

export const metadata: Metadata = { title: "Import history" };

export default async function ImportsPage() {
  const { supabase, company, can } = await getTenant();
  if (!can("data.import")) redirect("/app/quotes");
  const { data } = await supabase
    .from("import_batches")
    .select("id, kind, filename, status, summary, created_by_email, created_at, reverted_at")
    .eq("company_id", company.id)
    .order("created_at", { ascending: false })
    .limit(100);

  return (
    <div className="animate-rise">
      <PageHeader
        title="Import history"
        description="Every CSV import, what it changed, and who ran it. An import can be undone until its records are edited again."
        actions={
          <>
            <LinkButton href="/app/rates/import" variant="secondary">Import price list</LinkButton>
            <LinkButton href="/app/customers/import" variant="secondary">Import customers</LinkButton>
          </>
        }
      />
      <div className="card overflow-hidden">
        {!data?.length ? (
          <EmptyState icon={History} title="No imports yet" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px]">
              <thead>
                <tr>
                  <th className="th">File</th>
                  <th className="th">Type</th>
                  <th className="th">Result</th>
                  <th className="th">By</th>
                  <th className="th text-right">When</th>
                  <th className="th w-8" />
                </tr>
              </thead>
              <tbody>
                {data.map((b) => {
                  const s = b.summary as { create?: number; update?: number; error?: number };
                  return (
                    <tr key={b.id} className="group relative transition hover:bg-sunken/40">
                      <td className="td">
                        <Link href={`/app/imports/${b.id}`} className="rounded font-medium outline-none after:absolute after:inset-0 focus-visible:ring-2 focus-visible:ring-brand">
                          {b.filename}
                        </Link>
                      </td>
                      <td className="td">{b.kind === "rates" ? "Price list" : "Customers"}</td>
                      <td className="td">
                        <div className="flex flex-wrap gap-1">
                          {b.status === "reverted" ? (
                            <Badge tone="neutral" dot>Undone</Badge>
                          ) : (
                            <>
                              <Badge tone="success">{s.create ?? 0} new</Badge>
                              <Badge tone="info">{s.update ?? 0} updated</Badge>
                              {(s.error ?? 0) > 0 && <Badge tone="danger">{s.error} skipped</Badge>}
                            </>
                          )}
                        </div>
                      </td>
                      <td className="td text-[13px] text-ink-2">{b.created_by_email}</td>
                      <td className="td whitespace-nowrap text-right text-[13px] text-muted">{timeAgo(b.created_at)}</td>
                      <td className="td text-muted"><ChevronRight className="size-4" /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
