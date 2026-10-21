"use client";

import { useActionState, useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { buttonClass } from "@/components/ui";
import { acceptAsCurrentUser, acceptWithPassword } from "./actions";

export function AcceptForm({ token }: { token: string }) {
  const [error, action, pending] = useActionState(acceptWithPassword.bind(null, token), null);
  return (
    <form action={action} className="space-y-4">
      <div>
        <label className="label" htmlFor="password">Choose a password</label>
        <input className="input" id="password" name="password" type="password" autoComplete="new-password" minLength={10} required />
        <p className="mt-1 text-xs text-muted">At least 10 characters, with letters and a number.</p>
      </div>
      <div>
        <label className="label" htmlFor="confirm">Type it again</label>
        <input className="input" id="confirm" name="confirm" type="password" autoComplete="new-password" required />
      </div>
      {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-200">{error}</p>}
      <button className={buttonClass("primary", "md", "w-full")} disabled={pending}>
        {pending && <Loader2 className="size-4 animate-spin" />} Create account and join
      </button>
    </form>
  );
}

export function JoinButton({ token, company }: { token: string; company: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="space-y-3">
      {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-200">{error}</p>}
      <button className={buttonClass("primary", "md", "w-full")} disabled={pending} onClick={() => start(async () => setError(await acceptAsCurrentUser(token)))}>
        {pending && <Loader2 className="size-4 animate-spin" />} Join {company}
      </button>
    </div>
  );
}
