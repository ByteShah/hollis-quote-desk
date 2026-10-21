import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { MailPlus, Users } from "lucide-react";
import { getTenant } from "@/lib/tenant";
import { ROLE_HINT, ROLE_LABEL, type Role } from "@/lib/permissions";
import { Card } from "@/components/ui";
import { InviteButton, MemberRow, PendingInviteRow } from "./team-client";

export const metadata: Metadata = { title: "Team" };

export default async function TeamPage() {
  const { supabase, company, user, can } = await getTenant();
  if (!can("team.manage")) redirect("/app/settings");
  const [{ data: members }, { data: invites }] = await Promise.all([
    supabase.from("memberships").select("user_id, email, role, active, created_at").eq("company_id", company.id).order("created_at"),
    supabase
      .from("invitations")
      .select("id, email, role, expires_at, created_by_email, created_at")
      .eq("company_id", company.id)
      .is("accepted_at", null)
      .is("revoked_at", null)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false }),
  ]);

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[1fr_300px]">
      <div className="min-w-0 space-y-5">
        <Card title="People" icon={Users} action={<InviteButton />} bodyClassName="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px]">
              <thead>
                <tr>
                  <th className="th">Person</th>
                  <th className="th w-44">Role</th>
                  <th className="th w-28">Status</th>
                  <th className="th w-32" />
                </tr>
              </thead>
              <tbody>
                {(members ?? []).map((m) => (
                  <MemberRow key={m.user_id} member={{ ...m, role: m.role as Role }} isYou={m.user_id === user.id} />
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        {invites && invites.length > 0 && (
          <Card title="Waiting to accept" icon={MailPlus} bodyClassName="p-0">
            <table className="w-full">
              <tbody>
                {invites.map((i) => (
                  <PendingInviteRow key={i.id} invite={{ ...i, role: i.role as Role }} />
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </div>

      <Card title="Roles">
        <dl className="space-y-3 text-[13px]">
          {(Object.keys(ROLE_LABEL) as Role[]).map((r) => (
            <div key={r}>
              <dt className="font-medium">{ROLE_LABEL[r]}</dt>
              <dd className="text-ink-2">{ROLE_HINT[r]}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-4 border-t border-line/70 pt-3 text-xs text-muted">
          Every company keeps at least one active owner. Deactivated people can&apos;t sign in to {company.name}; their history stays.
        </p>
      </Card>
    </div>
  );
}
