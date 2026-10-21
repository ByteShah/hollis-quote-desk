import type { Metadata } from "next";
import { Building2, Check, Minus } from "lucide-react";
import { getUser } from "@/lib/tenant";
import { Card, EmptyState, PageHeader, Stat } from "@/components/ui";
import { timeAgo } from "@/components/status";
import { InviteOwnerButton, NewCompanyButton } from "./admin-client";

export const metadata: Metadata = { title: "Platform admin" };

type Row = {
  id: string; name: string; slug: string; created_at: string; members: number; owners: number; pending_invites: number;
  has_ai_key: boolean; rates: number; customers: number; quotes: number; last_quote_at: string | null;
};

const Tick = ({ on }: { on: boolean }) => (on ? <Check className="size-4 text-emerald-600" aria-label="Yes" /> : <Minus className="size-4 text-muted" aria-label="No" />);

export default async function AdminPage() {
  const { supabase } = await getUser();
  // Counts only: the function never returns quotes, prices or customer details.
  const { data } = await supabase.rpc("admin_company_overview");
  const rows = (data ?? []) as Row[];
  const live = rows.filter((r) => r.quotes > 0).length;

  return (
    <div className="animate-rise">
      <PageHeader
        title="Companies"
        description="Create a company and send its owner an invitation. You can see setup progress here, but not any company's quotes, prices or customers."
        actions={<NewCompanyButton />}
      />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Companies" value={rows.length} tone="brand" />
        <Stat label="Quoting" value={live} hint="have drafted a quote" tone="success" />
        <Stat label="Waiting for owner" value={rows.filter((r) => r.owners === 0).length} tone="warning" />
        <Stat label="People" value={rows.reduce((s, r) => s + r.members, 0)} tone="info" />
      </div>
      <Card bodyClassName="p-0">
        {rows.length === 0 ? (
          <EmptyState icon={Building2} title="No companies yet" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px]">
              <thead>
                <tr>
                  <th className="th">Company</th>
                  <th className="th text-center">Owner joined</th>
                  <th className="th text-center">AI key</th>
                  <th className="th text-right">Price list</th>
                  <th className="th text-right">Customers</th>
                  <th className="th text-right">Quotes</th>
                  <th className="th text-right">People</th>
                  <th className="th w-40" />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="td">
                      <div className="font-medium">{r.name}</div>
                      <div className="text-xs text-muted">{r.slug} · created {timeAgo(r.created_at)}{r.last_quote_at && ` · last quote ${timeAgo(r.last_quote_at)}`}</div>
                    </td>
                    <td className="td"><div className="flex justify-center"><Tick on={r.owners > 0} /></div></td>
                    <td className="td"><div className="flex justify-center"><Tick on={r.has_ai_key} /></div></td>
                    <td className="td text-right num">{r.rates}</td>
                    <td className="td text-right num">{r.customers}</td>
                    <td className="td text-right num">{r.quotes}</td>
                    <td className="td text-right num">
                      {r.members}
                      {r.pending_invites > 0 && <span className="text-xs text-amber-700"> +{r.pending_invites} invited</span>}
                    </td>
                    <td className="td text-right"><InviteOwnerButton companyId={r.id} company={r.name} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
