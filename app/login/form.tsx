"use client";

import { useActionState, useState } from "react";
import { ArrowRight, Eye, EyeOff, Loader2, Lock, ScanText, UserCheck } from "lucide-react";
import { Logo } from "@/components/status";
import { buttonClass } from "@/components/ui";
import { signIn } from "./actions";

const POINTS = [
  { icon: ScanText, title: "Reads the enquiry", text: "Works out the job, the measurements and who the customer is." },
  { icon: Lock, title: "Prices from your own list", text: "Every figure comes from your rates, never made up by the AI." },
  { icon: UserCheck, title: "Nothing goes out without you", text: "Each draft waits for a person to check, edit and approve it." },
];

export function LoginForm({ next, notice }: { next: string | null; notice: string | null }) {
  const [error, action, pending] = useActionState(signIn, null);
  const [show, setShow] = useState(false);

  return (
    <main className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      <section className="relative hidden overflow-hidden bg-brand px-12 py-12 text-white lg:flex lg:flex-col">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.045]"
          style={{
            backgroundImage: "repeating-linear-gradient(0deg, #fff 0 1px, transparent 1px 28px)",
          }}
          aria-hidden
        />
        <div className="relative flex items-center gap-2.5">
          <svg viewBox="0 0 32 32" className="size-8" aria-hidden>
            <rect width="32" height="32" rx="8" fill="#fff" fillOpacity=".12" />
            <path d="M7 11.5h18" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" />
            <path d="M7 16.5h13" stroke="#fff" strokeOpacity=".7" strokeWidth="2.6" strokeLinecap="round" />
            <path d="M7 21.5h8" stroke="#fff" strokeOpacity=".45" strokeWidth="2.6" strokeLinecap="round" />
          </svg>
          <span className="font-semibold">Quote Desk</span>
        </div>

        <div className="relative my-auto max-w-md">
          <h1 className="text-[2.1rem] font-semibold leading-[1.15] tracking-tight">
            Quotes drafted for you.
            <br />
            <span className="text-white/60">Approved by you.</span>
          </h1>
          <ul className="mt-10 space-y-6">
            {POINTS.map(({ icon: Icon, title, text }) => (
              <li key={title} className="flex gap-4">
                <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-white/10 ring-1 ring-white/15">
                  <Icon className="size-4" aria-hidden />
                </div>
                <div>
                  <div className="text-sm font-medium">{title}</div>
                  <div className="text-sm text-white/65">{text}</div>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-xs text-white/50">Each company&apos;s data and AI key are kept separate.</p>
      </section>

      <section className="flex items-center justify-center px-5 py-12">
        <div className="w-full max-w-sm animate-rise">
          <div className="mb-8 lg:hidden">
            <Logo className="size-9" />
          </div>
          <h2 className="text-2xl font-semibold tracking-tight">Sign in</h2>
          <p className="mt-1 text-sm text-muted">Use the account for your company.</p>

          {notice && (
            <p role="status" className="mt-6 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 ring-1 ring-amber-200">{notice}</p>
          )}
          <form action={action} className="mt-8 space-y-4">
            {next && <input type="hidden" name="next" value={next} />}
            <div>
              <label className="label" htmlFor="email">Email</label>
              <input className="input" id="email" name="email" type="email" autoComplete="email" autoFocus required />
            </div>
            <div>
              <label className="label" htmlFor="password">Password</label>
              <div className="relative">
                <input
                  className="input pr-10"
                  id="password"
                  name="password"
                  type={show ? "text" : "password"}
                  autoComplete="current-password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShow((s) => !s)}
                  className="absolute inset-y-0 right-0 grid w-10 place-items-center text-muted hover:text-ink"
                  aria-label={show ? "Hide password" : "Show password"}
                >
                  {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </div>
            {error && (
              <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-200">
                {error}
              </p>
            )}
            <button className={buttonClass("primary", "md", "w-full")} disabled={pending}>
              {pending ? <Loader2 className="size-4 animate-spin" /> : null}
              {pending ? "Signing in…" : "Sign in"}
              {!pending && <ArrowRight className="size-4" />}
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}
