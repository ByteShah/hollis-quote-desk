"use client";

import { useActionState, useEffect, useState } from "react";
import Link from "next/link";
import { Check, ClipboardPaste, Loader2, Sparkles, UserRound, X } from "lucide-react";
import { toast } from "sonner";
import { Kbd, buttonClass, cn } from "@/components/ui";
import { generateQuote } from "../actions";

const MAX = 10_000;
const STEPS = [
  "Reading the enquiry",
  "Checking your customer list",
  "Choosing items from your price list",
  "Working out quantities, minimum charge and VAT",
];

export function NewQuoteForm({ customer }: { customer: { id: string; name: string } | null }) {
  const [error, action, pending] = useActionState(generateQuote, null);
  const [text, setText] = useState("");
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (error) toast.error(error);
  }, [error]);

  // The steps are a guide to what's happening, not a live trace; they pace
  // themselves and hold on the last one until the server answers.
  useEffect(() => {
    if (!pending) return setStep(0);
    const t = setInterval(() => setStep((s) => Math.min(s + 1, STEPS.length - 1)), 2600);
    return () => clearInterval(t);
  }, [pending]);

  const paste = async () => {
    try {
      setText((await navigator.clipboard.readText()).slice(0, MAX));
    } catch {
      toast.info("Your browser blocked clipboard access. Paste with Ctrl/⌘ + V instead.");
    }
  };

  return (
    <form action={action} className="card overflow-hidden">
      {customer && <input type="hidden" name="customer_id" value={customer.id} />}
      {customer && !pending && (
        <div className="flex items-center gap-2 border-b border-line/70 bg-brand-soft/40 px-4 py-2 text-[13px]">
          <UserRound className="size-3.5 text-brand" /> Quote for <strong className="font-medium">{customer.name}</strong>
          <Link href="/app/quotes/new" className="ml-auto rounded p-0.5 text-muted hover:text-ink" aria-label="Don't link to this customer">
            <X className="size-3.5" />
          </Link>
        </div>
      )}
      {pending ? (
        <div className="px-6 py-10 sm:px-10" aria-live="polite">
          <div className="mb-6 flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-xl bg-brand-soft">
              <Sparkles className="size-5 text-brand" aria-hidden />
            </div>
            <div>
              <div className="font-semibold">Drafting your quote</div>
              <div className="text-[13px] text-muted">Usually 10–30 seconds. You&apos;ll be taken to the draft when it&apos;s ready.</div>
            </div>
          </div>
          <ol className="space-y-3">
            {STEPS.map((s, i) => (
              <li key={s} className={cn("flex items-center gap-3 text-sm transition", i > step && "text-muted/60")}>
                <span
                  className={cn(
                    "grid size-6 shrink-0 place-items-center rounded-full ring-1",
                    i < step ? "bg-brand text-white ring-brand" : i === step ? "bg-surface ring-brand" : "bg-sunken ring-line",
                  )}
                >
                  {i < step ? <Check className="size-3.5" /> : i === step ? <Loader2 className="size-3.5 animate-spin text-brand" /> : null}
                </span>
                {s}
              </li>
            ))}
          </ol>
          {/* keep the text in the form while pending */}
          <input type="hidden" name="enquiry" value={text} />
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between border-b border-line/70 px-4 py-2.5">
            <label htmlFor="enquiry" className="text-sm font-semibold">Customer enquiry</label>
            <button type="button" onClick={paste} className={buttonClass("ghost", "sm")}>
              <ClipboardPaste className="size-3.5" /> Paste
            </button>
          </div>
          <textarea
            id="enquiry"
            name="enquiry"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") e.currentTarget.form?.requestSubmit();
            }}
            className="block min-h-[26rem] w-full resize-y bg-surface px-4 py-3 font-mono text-[13px] leading-relaxed text-ink outline-none placeholder:text-muted/60"
            placeholder={"From: Jane Smith <jane@example.com>\nSubject: Patio quote\n\nHi, could you quote for a new patio at the back, about 4m x 5m…"}
            maxLength={MAX}
            required
          />
          <div className="flex flex-wrap items-center gap-3 border-t border-line/70 bg-sunken/40 px-4 py-3">
            <span className={cn("text-xs num", text.length > MAX * 0.9 ? "text-amber-700" : "text-muted")}>
              {text.length.toLocaleString("en-GB")} / {MAX.toLocaleString("en-GB")}
            </span>
            <span className="hidden text-xs text-muted sm:inline">
              <Kbd>⌘</Kbd> <Kbd>Enter</Kbd> to draft
            </span>
            <button className={buttonClass("primary", "md", "ml-auto")} disabled={text.trim().length < 20}>
              <Sparkles className="size-4" /> Draft quote
            </button>
          </div>
        </>
      )}
    </form>
  );
}
