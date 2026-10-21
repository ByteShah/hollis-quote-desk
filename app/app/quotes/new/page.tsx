"use client";

import { useActionState } from "react";
import { generateQuote } from "../actions";

export default function NewQuotePage() {
  const [error, action, pending] = useActionState(generateQuote, null);
  return (
    <form action={action} className="max-w-3xl space-y-4">
      <div>
        <h1 className="text-xl font-semibold">New quote</h1>
        <p className="text-sm text-stone-500">
          Paste the customer&apos;s email or website enquiry, headers included if you have them. You&apos;ll get a draft to
          check; nothing is sent to the customer.
        </p>
      </div>
      <textarea
        name="enquiry"
        className="input min-h-[22rem] font-mono text-xs"
        placeholder={"From: …\nSubject: …\n\nHi, could you quote for…"}
        maxLength={10000}
        required
      />
      {error && <p className="text-sm text-red-700">{error}</p>}
      <button className="btn-primary" disabled={pending}>
        {pending ? "Drafting… (up to a minute)" : "Draft quote"}
      </button>
    </form>
  );
}
