"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Loader2, Printer, RotateCcw, ShieldAlert, X } from "lucide-react";
import { toast } from "sonner";
import { Button, cn } from "@/components/ui";
import { formatGBP } from "@/lib/quote/money";
import { setCustomer, setStatus } from "../actions";

export function ReviewActions({
  quoteId,
  status,
  outcome,
  total,
  customerName,
  hasDanger,
  canApprove,
}: {
  quoteId: string;
  status: string;
  outcome: string;
  total: number;
  customerName: string | null;
  hasDanger: boolean;
  canApprove: boolean;
}) {
  const [pending, start] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const router = useRouter();

  const run = (next: "approved" | "rejected" | "draft", done: string) =>
    start(async () => {
      const res = await setStatus(quoteId, next);
      if (res.error) toast.error(res.error);
      else {
        toast.success(done);
        setConfirming(false);
        router.refresh();
      }
    });

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="secondary" onClick={() => window.print()} title="Print or save as PDF">
        <Printer className="size-4" /> Print
      </Button>
      {status === "draft" && !canApprove && (
        <span className="rounded-lg bg-sunken px-3 py-2 text-[13px] text-muted ring-1 ring-line">Waiting for an owner or manager to approve</span>
      )}
      {status === "draft" && canApprove && (
        <>
          <Button variant="danger" disabled={pending} onClick={() => run("rejected", "Quote rejected")}>
            <X className="size-4" /> Reject
          </Button>
          <Button variant="approve" disabled={pending} onClick={() => setConfirming(true)}>
            <Check className="size-4" /> Approve
          </Button>
        </>
      )}
      {status === "rejected" && canApprove && (
        <Button variant="secondary" disabled={pending} onClick={() => run("draft", "Quote reopened")}>
          <RotateCcw className="size-4" /> Reopen
        </Button>
      )}

      {confirming && (
        <ConfirmDialog onClose={() => !pending && setConfirming(false)}>
          <h2 className="text-lg font-semibold tracking-tight">Approve this quote?</h2>
          <p className="mt-1 text-sm text-muted">
            Once approved it&apos;s locked and ready to send. Unsaved line changes are not included.
          </p>
          <div className="mt-5 rounded-xl bg-sunken px-4 py-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted">Customer</span>
              <span className="font-medium">{customerName ?? "Not matched"}</span>
            </div>
            <div className="mt-1 flex justify-between">
              <span className="text-muted">{outcome === "quote" ? "Total inc VAT" : "Outcome"}</span>
              <span className="font-semibold num">{outcome === "quote" ? formatGBP(total) : "Site visit reply"}</span>
            </div>
          </div>
          {!customerName && (
            <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-[13px] text-amber-900 ring-1 ring-amber-200">
              This quote isn&apos;t linked to a customer. You can still approve it, but saving the customer first keeps their history and
              payment terms in one place.{" "}
              <Link href={`/app/customers/new?from_quote=${quoteId}`} className="font-medium underline">Save as new customer</Link>
            </p>
          )}
          {hasDanger && (
            <p className="mt-3 flex gap-2 rounded-lg bg-red-50 px-3 py-2 text-[13px] text-red-800 ring-1 ring-red-200">
              <ShieldAlert className="mt-0.5 size-4 shrink-0" />
              This enquiry contained instructions aimed at the quoting system. They were ignored. Check the reply makes sense.
            </p>
          )}
          <div className="mt-6 flex justify-end gap-2">
            <Button variant="secondary" disabled={pending} onClick={() => setConfirming(false)}>
              Cancel
            </Button>
            <Button variant="approve" disabled={pending} onClick={() => run("approved", "Quote approved")} autoFocus>
              {pending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />} Approve quote
            </Button>
          </div>
        </ConfirmDialog>
      )}
    </div>
  );
}

function ConfirmDialog({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => e.target === ref.current && onClose()}
      className={cn(
        "m-auto w-[calc(100%-2rem)] max-w-md rounded-2xl border border-line bg-surface p-6 text-ink shadow-(--shadow-pop)",
        "backdrop:bg-ink/30 backdrop:backdrop-blur-[2px] open:animate-rise",
      )}
    >
      {children}
    </dialog>
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
  const router = useRouter();
  return (
    <div className="relative">
      <select
        id="customer"
        // Stops the browser restoring an old choice on back/reload, which
        // React doesn't correct after hydration.
        autoComplete="off"
        className="input appearance-none pr-8"
        value={current ?? ""}
        disabled={pending}
        onChange={(e) =>
          start(async () => {
            const res = await setCustomer(quoteId, e.target.value || null);
            if (res.error) toast.error(res.error);
            else {
              toast.success("Customer updated");
              router.refresh();
            }
          })
        }
      >
        <option value="">No customer selected</option>
        {customers.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      {pending && <Loader2 className="absolute right-2.5 top-3 size-4 animate-spin text-muted" />}
    </div>
  );
}
