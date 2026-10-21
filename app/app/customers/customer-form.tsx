"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Archive, ArchiveRestore, Loader2, Save, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { Button, buttonClass } from "@/components/ui";
import { Dialog } from "@/components/dialog";
import { createCustomer, setCustomerArchived, updateCustomer } from "./actions";

export type CustomerFormValues = {
  name: string;
  company_name: string;
  emails: string;
  phones: string;
  address: string;
  postcode: string;
  invoice_email: string;
  payment_terms: string;
  tags: string;
  notes: string;
};

export function CustomerForm({
  mode,
  id,
  version: initialVersion,
  initial,
  fromQuoteId,
  readOnly,
  tagSuggestions,
}: {
  mode: "create" | "edit";
  id?: string;
  version?: number;
  initial: CustomerFormValues;
  fromQuoteId?: string | null;
  readOnly: boolean;
  tagSuggestions: string[];
}) {
  const [v, setV] = useState(initial);
  const [version, setVersion] = useState(initialVersion ?? 1);
  const [dirty, setDirty] = useState(mode === "create");
  const [conflict, setConflict] = useState(false);
  const [duplicate, setDuplicate] = useState<{ id: string; name: string } | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  useEffect(() => {
    if (dirty) return;
    setVersion(initialVersion ?? 1);
    setV(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialVersion]);

  useEffect(() => {
    if (!dirty || readOnly) return;
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty, readOnly]);

  const set = (k: keyof CustomerFormValues, val: string) => {
    setV((s) => ({ ...s, [k]: val }));
    setDirty(true);
    setDuplicate(null);
  };

  const save = () =>
    start(async () => {
      if (mode === "create") {
        const res = await createCustomer(v, fromQuoteId);
        if (!res.ok) {
          if (res.duplicate) setDuplicate(res.duplicate);
          return void toast.error(res.error);
        }
        setDirty(false);
        toast.success(fromQuoteId ? "Customer created and linked to the quote" : "Customer created");
        router.push(fromQuoteId ? `/app/quotes/${fromQuoteId}` : `/app/customers/${res.id}`);
        return;
      }
      const res = await updateCustomer(id!, version, v);
      if (!res.ok) {
        if (res.conflict) setConflict(true);
        if (res.duplicate) setDuplicate(res.duplicate);
        return void toast.error(res.error);
      }
      setVersion(res.version);
      setDirty(false);
      toast.success("Saved");
      router.refresh();
    });

  const field = (k: keyof CustomerFormValues, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <div>
      <label className="label" htmlFor={k}>{label}</label>
      <input id={k} className="input" value={v[k]} onChange={(e) => set(k, e.target.value)} disabled={readOnly || pending} {...props} />
    </div>
  );

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      {conflict && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          Someone else saved this customer while you were editing.
          <button type="button" onClick={() => window.location.reload()} className={buttonClass("secondary", "sm", "ml-auto")}>
            Reload their version
          </button>
        </div>
      )}
      {duplicate && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-950">
          {duplicate.name} already uses that email or phone number.
          <Link href={`/app/customers/${duplicate.id}`} className={buttonClass("secondary", "sm", "ml-auto")}>
            Open {duplicate.name}
          </Link>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {field("name", "Name", { required: true, maxLength: 200, placeholder: "Patience Okafor", autoFocus: mode === "create" })}
        {field("company_name", "Company", { maxLength: 200, placeholder: "Optional" })}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {field("emails", "Email addresses", { placeholder: "Separate several with commas", inputMode: "email" })}
        {field("phones", "Phone numbers", { placeholder: "Separate several with commas", inputMode: "tel" })}
      </div>
      <div className="grid gap-4 sm:grid-cols-[1fr_9rem]">
        {field("address", "Address", { maxLength: 300 })}
        {field("postcode", "Postcode", { maxLength: 12, className: "input uppercase" })}
      </div>

      <fieldset className="rounded-xl border border-line p-4">
        <legend className="px-1 text-[13px] font-medium text-ink-2">Billing</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          {field("invoice_email", "Send invoices to", { placeholder: "If different from the main email", inputMode: "email" })}
          {field("payment_terms", "Payment terms", { placeholder: "e.g. 30 days", maxLength: 60 })}
        </div>
      </fieldset>

      <div>
        {field("tags", "Tags", { placeholder: "e.g. landlord, trade", list: "tag-suggestions" })}
        <datalist id="tag-suggestions">
          {tagSuggestions.map((t) => (
            <option key={t} value={t} />
          ))}
        </datalist>
      </div>
      <div>
        <label className="label" htmlFor="notes">Notes</label>
        <textarea id="notes" rows={3} className="input h-auto py-2" value={v.notes} onChange={(e) => set("notes", e.target.value)} disabled={readOnly || pending} maxLength={2000} placeholder="History, preferences, anything the team should know" />
        <p className="mt-1 text-xs text-muted">Shown to the AI when this customer sends an enquiry, so keep it factual.</p>
      </div>

      {!readOnly && (dirty || mode === "create") && (
        <div className="sticky bottom-4 z-10 flex items-center gap-3 rounded-xl border border-line bg-ink px-4 py-2.5 text-sm text-white shadow-(--shadow-pop) animate-rise">
          <span className="size-2 rounded-full bg-amber-400" />
          {mode === "create" ? "New customer" : "Unsaved changes"}
          <div className="ml-auto flex gap-2">
            {mode === "edit" && (
              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  setV(initial);
                  setDirty(false);
                }}
                className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-white/80 hover:bg-white/10 hover:text-white"
              >
                <Undo2 className="size-4" /> Discard
              </button>
            )}
            <button type="submit" disabled={pending} className="flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 font-medium text-ink hover:bg-white/90 disabled:opacity-60">
              {pending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} {mode === "create" ? "Create customer" : "Save"}
            </button>
          </div>
        </div>
      )}
    </form>
  );
}

export function CustomerArchiveButton({ id, version, archived, name }: { id: string; version: number; archived: boolean; name: string }) {
  const [confirm, setConfirm] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();
  const run = () =>
    start(async () => {
      const res = await setCustomerArchived(id, version, !archived);
      if (!res.ok) return void toast.error(res.error);
      toast.success(archived ? `${name} restored` : `${name} archived`);
      setConfirm(false);
      router.refresh();
    });
  if (archived) {
    return (
      <Button variant="secondary" onClick={run} disabled={pending}>
        {pending ? <Loader2 className="size-4 animate-spin" /> : <ArchiveRestore className="size-4" />} Restore
      </Button>
    );
  }
  return (
    <>
      <Button variant="secondary" onClick={() => setConfirm(true)}>
        <Archive className="size-4" /> Archive
      </Button>
      {confirm && (
        <Dialog
          title={`Archive ${name}?`}
          description="They won't be matched to new enquiries or shown in the customer list. Their quotes are kept, and you can restore them any time."
          onClose={() => !pending && setConfirm(false)}
        >
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setConfirm(false)} disabled={pending}>Cancel</Button>
            <Button variant="danger" onClick={run} disabled={pending}>
              {pending ? <Loader2 className="size-4 animate-spin" /> : <Archive className="size-4" />} Archive
            </Button>
          </div>
        </Dialog>
      )}
    </>
  );
}
