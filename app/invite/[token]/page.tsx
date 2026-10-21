import Link from "next/link";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { lookupInvitation } from "@/lib/invites";
import { ROLE_HINT, ROLE_LABEL } from "@/lib/permissions";
import { Logo } from "@/components/status";
import { buttonClass } from "@/components/ui";
import { AcceptForm, JoinButton } from "./forms";

export const metadata: Metadata = { title: "Join your team" };
export const dynamic = "force-dynamic";

const DEAD: Record<string, [string, string]> = {
  used: ["This invitation has already been used", "Sign in with the account you created."],
  expired: ["This invitation has expired", "Ask whoever invited you to send a new link."],
  revoked: ["This invitation was cancelled", "Ask whoever invited you to send a new link."],
  missing: ["This link isn't valid", "Check you copied the whole link, or ask for a new one."],
};

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invite = await lookupInvitation(token);

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-md animate-rise">
        <Logo className="mb-8 size-9" />
        {invite.state !== "valid" ? (
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{DEAD[invite.state][0]}</h1>
            <p className="mt-2 text-sm text-muted">{DEAD[invite.state][1]}</p>
            <Link href="/login" className={buttonClass("secondary", "md", "mt-6")}>Go to sign in</Link>
          </div>
        ) : (
          <Valid token={token} invite={invite} />
        )}
      </div>
    </main>
  );
}

async function Valid({ token, invite }: { token: string; invite: Extract<Awaited<ReturnType<typeof lookupInvitation>>, { state: "valid" }> }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div>
      <p className="text-sm text-muted">You&apos;ve been invited to join</p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight">{invite.companyName}</h1>
      <div className="mt-5 rounded-xl bg-sunken/70 px-4 py-3 text-sm ring-1 ring-line">
        <div className="flex justify-between gap-3">
          <span className="text-muted">Email</span>
          <span className="font-medium">{invite.email}</span>
        </div>
        <div className="mt-1 flex justify-between gap-3">
          <span className="text-muted">Role</span>
          <span className="font-medium">{ROLE_LABEL[invite.role]}</span>
        </div>
        <p className="mt-2 text-xs text-muted">{ROLE_HINT[invite.role]}</p>
      </div>

      <div className="mt-6">
        {user ? (
          user.email?.toLowerCase() === invite.email.toLowerCase() ? (
            <JoinButton token={token} company={invite.companyName} />
          ) : (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 ring-1 ring-amber-200">
              You&apos;re signed in as {user.email}. Sign out, then open this link again to accept as {invite.email}.
            </p>
          )
        ) : (
          // We don't reveal whether this email already has an account: new
          // people set a password; existing users sign in instead.
          <>
            <AcceptForm token={token} />
            <p className="mt-4 text-center text-sm text-muted">
              Already use Quote Desk?{" "}
              <Link href={`/login?next=${encodeURIComponent(`/invite/${token}`)}`} className="font-medium text-brand hover:underline">
                Sign in to accept
              </Link>
            </p>
          </>
        )}
      </div>
      <p className="mt-6 text-xs text-muted">Expires {new Date(invite.expiresAt).toLocaleDateString("en-GB", { day: "numeric", month: "long" })}.</p>
    </div>
  );
}
