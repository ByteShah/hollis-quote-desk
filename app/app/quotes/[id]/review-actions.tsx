"use client";

import { useState, useTransition } from "react";
import { setCustomer, setStatus } from "../actions";

export function ReviewActions({ quoteId, status }: { quoteId: string; status: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = (next: string, confirmText?: string) => {
    if (confirmText && !window.confirm(confirmText)) return;
    start(async () => {
      const res = await setStatus(quoteId, next);
      setError(res.error ?? null);
    });
  };

  return (
    <div className="no-print flex flex-col items-end gap-1">
      <div className="flex gap-2">
        <button className="btn-secondary" type="button" onClick={() => window.print()}>Print</button>
        {status === "draft" && (
          <>
            <button className="btn-danger" disabled={pending} onClick={() => run("rejected")}>Reject</button>
            <button
              className="btn-approve"
              disabled={pending}
              onClick={() => run("approved", "Approve this quote? Save any line changes first. Approved quotes can't be edited.")}
            >
              Approve
            </button>
          </>
        )}
        {status === "rejected" && (
          <button className="btn-secondary" disabled={pending} onClick={() => run("draft")}>Reopen</button>
        )}
      </div>
      {error && <span className="text-xs text-red-700">{error}</span>}
    </div>
  );
}

export function CustomerPicker({
  quoteId,
  current,
  customers,
}: {
  quoteId: string;
  current: string | null;
  customers: { id: string; name: string }[];
}) {
  const [pending, start] = useTransition();
  return (
    <select
      className="input py-1.5"
      value={current ?? ""}
      disabled={pending}
      onChange={(e) => start(async () => void (await setCustomer(quoteId, e.target.value || null)))}
    >
      <option value="">No customer selected</option>
      {customers.map((c) => (
        <option key={c.id} value={c.id}>{c.name}</option>
      ))}
    </select>
  );
}
