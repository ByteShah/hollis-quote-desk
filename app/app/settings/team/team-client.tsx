"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, Loader2, MailPlus, UserCheck, UserX } from "lucide-react";
import { toast } from "sonner";
import { ROLE_HINT, ROLE_LABEL, type Role } from "@/lib/permissions";
import { Badge, Button, buttonClass, cn } from "@/components/ui";
import { Dialog } from "@/components/dialog";
import { initials } from "@/components/status";
import { changeRole, inviteMember, revokeInvite, setMemberActive } from "./actions";

const ROLES = Object.keys(ROLE_LABEL) as Role[];

export function CopyLink({ link }: { link: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex gap-2">
      <input readOnly value={link} className="input font-mono text-xs" onFocus={(e) => e.target.select()} aria-label="Invitation link" />
      <Button
        type="button"
        variant="secondary"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(link);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          } catch {
            toast.info("Select the link and copy it.");
          }
        }}
      >
        {copied ? <Check className="size-4" /> : <Copy className="size-4" />} {copied ? "Copied" : "Copy"}
      </Button>
    </div>
  );
}

export function InviteButton() {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("estimator");
  const [result, setResult] = useState<{ link: string; expiresAt: string } | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const close = () => {
    setOpen(false);
    setResult(null);
    setEmail("");
  };
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <MailPlus className="size-3.5" /> Invite
      </Button>
      {open && (
        <Dialog title={result ? "Send this link" : "Invite someone"} description={result ? undefined : "They'll get a one-time link to set a password and join."} onClose={() => !pending && close()}>
          {result ? (
            <div className="space-y-4">
              <p className="text-sm text-ink-2">
                Send this link to <strong className="font-medium">{email}</strong> (email, text or WhatsApp). It works once and expires on{" "}
                {new Date(result.expiresAt).toLocaleDateString("en-GB", { day: "numeric", month: "long" })}. It won&apos;t be shown again.
              </p>
              <CopyLink link={result.link} />
              <div className="flex justify-end">
                <Button onClick={close}>Done</Button>
              </div>
            </div>
          ) : (
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                start(async () => {
                  const res = await inviteMember({ email, role });
                  if (!res.ok) return void toast.error(res.error);
                  setResult(res);
                  router.refresh();
                });
              }}
            >
              <div>
                <label className="label" htmlFor="invite-email">Email</label>
                <input id="invite-email" type="email" required autoFocus className="input" value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <fieldset>
                <legend className="label">Role</legend>
                <div className="space-y-2">
                  {ROLES.map((r) => (
                    <label key={r} className={cn("flex cursor-pointer items-start gap-2.5 rounded-xl border px-3 py-2.5", role === r ? "border-brand bg-brand-soft/40" : "border-line-strong")}>
                      <input type="radio" name="role" checked={role === r} onChange={() => setRole(r)} className="mt-1 accent-(--color-brand)" />
                      <span>
                        <span className="block text-sm font-medium">{ROLE_LABEL[r]}</span>
                        <span className="block text-xs text-muted">{ROLE_HINT[r]}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="secondary" onClick={close} disabled={pending}>Cancel</Button>
                <Button type="submit" disabled={pending}>
                  {pending && <Loader2 className="size-4 animate-spin" />} Create invitation link
                </Button>
              </div>
            </form>
          )}
        </Dialog>
      )}
    </>
  );
}

export function MemberRow({ member, isYou }: { member: { user_id: string; email: string | null; role: Role; active: boolean }; isYou: boolean }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, done: string) =>
    start(async () => {
      const res = await fn();
      if (!res.ok) return void toast.error(res.error);
      toast.success(done);
      router.refresh();
    });
  return (
    <tr className={cn(!member.active && "text-muted")}>
      <td className="td">
        <div className="flex items-center gap-3">
          <div className="grid size-8 shrink-0 place-items-center rounded-full bg-brand-soft text-xs font-semibold text-brand-ink">{initials(member.email ?? "?")}</div>
          <div className="min-w-0">
            <div className="truncate font-medium">{member.email}</div>
            {isYou && <div className="text-xs text-muted">You</div>}
          </div>
        </div>
      </td>
      <td className="td">
        <select
          className="input h-9 text-[13px]"
          value={member.role}
          disabled={pending || !member.active}
          aria-label={`Role for ${member.email}`}
          onChange={(e) => run(() => changeRole(member.user_id, e.target.value), "Role changed")}
        >
          {ROLES.map((r) => (
            <option key={r} value={r}>{ROLE_LABEL[r]}</option>
          ))}
        </select>
      </td>
      <td className="td">{member.active ? <Badge tone="success" dot>Active</Badge> : <Badge dot>Deactivated</Badge>}</td>
      <td className="td text-right">
        {pending ? (
          <Loader2 className="ml-auto size-4 animate-spin text-muted" />
        ) : member.active ? (
          !isYou && (
            <button type="button" className={buttonClass("ghost", "sm")} onClick={() => run(() => setMemberActive(member.user_id, false), "Deactivated")}>
              <UserX className="size-3.5" /> Deactivate
            </button>
          )
        ) : (
          <button type="button" className={buttonClass("ghost", "sm")} onClick={() => run(() => setMemberActive(member.user_id, true), "Reactivated")}>
            <UserCheck className="size-3.5" /> Reactivate
          </button>
        )}
      </td>
    </tr>
  );
}

export function PendingInviteRow({ invite }: { invite: { id: string; email: string; role: Role; expires_at: string; created_by_email: string | null } }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <tr>
      <td className="td">
        <div className="font-medium">{invite.email}</div>
        <div className="text-xs text-muted">
          {ROLE_LABEL[invite.role]} · invited by {invite.created_by_email ?? "unknown"} · expires {new Date(invite.expires_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
        </div>
      </td>
      <td className="td text-right">
        <button
          type="button"
          disabled={pending}
          className={buttonClass("ghost", "sm")}
          onClick={() =>
            start(async () => {
              const res = await revokeInvite(invite.id);
              if (!res.ok) return void toast.error(res.error);
              toast.success("Invitation cancelled");
              router.refresh();
            })
          }
        >
          {pending && <Loader2 className="size-3.5 animate-spin" />} Cancel invitation
        </button>
      </td>
    </tr>
  );
}
