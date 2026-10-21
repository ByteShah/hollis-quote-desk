"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Save, Trash2, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { UNIT_OPTIONS, unitLabel } from "@/lib/rates";
import { buttonClass, cn } from "@/components/ui";
import { createRate, updateRate } from "./actions";

type Modifier = { label: string; amount: number | string; per: "unit" | "flat" };
export type RateFormValues = {
  code: string;
  item: string;
  category: string;
  unit: string;
  status: "active" | "price_on_request" | "not_offered";
  notes: string;
  modifiers: Modifier[];
  price?: string;
};

const STATUS_OPTIONS = [
  { value: "active", label: "In use", hint: "Offered to the AI for new quotes" },
  { value: "price_on_request", label: "No price yet", hint: "AI lists it as 'needs pricing by hand'" },
  { value: "not_offered", label: "Not offered", hint: "Work you don't do; AI tells the customer" },
] as const;

export function RateForm({
  mode,
  id,
  version: initialVersion,
  initial,
  categories,
  readOnly,
}: {
  mode: "create" | "edit";
  id?: string;
  version?: number;
  initial: RateFormValues;
  categories: string[];
  readOnly: boolean;
}) {
  const [v, setV] = useState(initial);
  const [version, setVersion] = useState(initialVersion ?? 1);
  const [dirty, setDirty] = useState(mode === "create");
  const [conflict, setConflict] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();

  // Price changes and "mark reviewed" bump the version on the server; when the
  // form has no unsaved edits, take the fresh values so the next save doesn't
  // report a false conflict.
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

  const set = <K extends keyof RateFormValues>(k: K, val: RateFormValues[K]) => {
    setV((s) => ({ ...s, [k]: val }));
    setDirty(true);
  };
  const setMod = (i: number, patch: Partial<Modifier>) =>
    set("modifiers", v.modifiers.map((m, j) => (j === i ? { ...m, ...patch } : m)));

  const save = () =>
    start(async () => {
      const payload = { ...v, modifiers: v.modifiers.map((m) => ({ ...m, amount: Number(m.amount) })) };
      if (mode === "create") {
        const res = await createRate(payload);
        if (!res.ok) return void toast.error(res.error);
        setDirty(false);
        toast.success(`${v.code.toUpperCase()} created`);
        router.push(`/app/rates/${res.id}`);
        return;
      }
      const res = await updateRate(id!, version, payload);
      if (!res.ok) {
        if (res.conflict) setConflict(true);
        return void toast.error(res.error);
      }
      setVersion(res.version);
      setDirty(false);
      toast.success("Saved");
      router.refresh();
    });

  const disabled = readOnly || pending;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
      className="space-y-5"
    >
      {conflict && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          Someone else saved this item while you were editing.
          <button type="button" onClick={() => window.location.reload()} className={buttonClass("secondary", "sm", "ml-auto")}>
            Reload their version
          </button>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-[10rem_1fr]">
        <div>
          <label className="label" htmlFor="code">Code</label>
          <input
            id="code"
            className="input font-mono uppercase"
            value={v.code}
            onChange={(e) => set("code", e.target.value.toUpperCase())}
            disabled={mode === "edit" || disabled}
            maxLength={20}
            required
            placeholder="BP05"
          />
          {mode === "create" && <p className="mt-1 text-xs text-muted">Can&apos;t be changed later.</p>}
        </div>
        <div>
          <label className="label" htmlFor="item">Item</label>
          <input id="item" className="input" value={v.item} onChange={(e) => set("item", e.target.value)} disabled={disabled} maxLength={200} required placeholder="Block paving supply & lay" />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="category">Category</label>
          <input id="category" className="input" list="categories" value={v.category} onChange={(e) => set("category", e.target.value)} disabled={disabled} maxLength={60} placeholder="Block paving" />
          <datalist id="categories">
            {categories.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </div>
        <div>
          <label className="label" htmlFor="unit">Priced per</label>
          <select id="unit" className="input" value={v.unit} onChange={(e) => set("unit", e.target.value)} disabled={disabled}>
            {UNIT_OPTIONS.map((u) => (
              <option key={u.value} value={u.value}>{u.label}</option>
            ))}
          </select>
        </div>
      </div>

      {mode === "create" && (
        <div className="sm:w-1/2">
          <label className="label" htmlFor="price">Price ex VAT</label>
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-2.5 text-sm text-muted">£</span>
            <input id="price" className="input pl-7 num" type="number" min="0" step="0.01" inputMode="decimal" value={v.price ?? ""} onChange={(e) => set("price", e.target.value)} disabled={disabled} placeholder={v.status === "active" ? "Required" : "Optional"} />
            <span className="pointer-events-none absolute right-3 top-2.5 text-[13px] text-muted">/{unitLabel(v.unit)}</span>
          </div>
        </div>
      )}

      <fieldset>
        <legend className="label">Status</legend>
        <div className="grid gap-2 sm:grid-cols-3">
          {STATUS_OPTIONS.map((s) => (
            <label
              key={s.value}
              className={cn(
                "flex cursor-pointer items-start gap-2.5 rounded-xl border px-3 py-2.5 transition",
                v.status === s.value ? "border-brand bg-brand-soft/40 ring-4 ring-brand/10" : "border-line-strong hover:bg-sunken/60",
                disabled && "pointer-events-none opacity-70",
              )}
            >
              <input type="radio" name="status" value={s.value} checked={v.status === s.value} onChange={() => set("status", s.value)} disabled={disabled} className="mt-1 accent-(--color-brand)" />
              <span>
                <span className="block text-sm font-medium">{s.label}</span>
                <span className="block text-xs text-muted">{s.hint}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div>
        <label className="label" htmlFor="notes">Notes for the AI and your team</label>
        <textarea id="notes" rows={3} className="input h-auto py-2" value={v.notes} onChange={(e) => set("notes", e.target.value)} disabled={disabled} maxLength={1000} placeholder="e.g. up to 150mm deep; includes breaker hire" />
      </div>

      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <span className="label mb-0">Extras</span>
          {!disabled && v.modifiers.length < 10 && (
            <button type="button" className={buttonClass("ghost", "sm")} onClick={() => set("modifiers", [...v.modifiers, { label: "", amount: "", per: "unit" }])}>
              <Plus className="size-3.5" /> Add extra
            </button>
          )}
        </div>
        {v.modifiers.length === 0 ? (
          <p className="rounded-lg bg-sunken/60 px-3 py-2 text-[13px] text-muted">
            Optional add-ons the AI can pick, such as &ldquo;herringbone +£4/m²&rdquo; or &ldquo;road permit +£60&rdquo;.
          </p>
        ) : (
          <ul className="space-y-2">
            {v.modifiers.map((m, i) => (
              <li key={i} className="grid grid-cols-[1fr_7rem_8.5rem_auto] items-center gap-2">
                <input className="input" aria-label="Extra label" value={m.label} onChange={(e) => setMod(i, { label: e.target.value })} disabled={disabled} placeholder="Herringbone pattern" maxLength={80} />
                <div className="relative">
                  <span className="pointer-events-none absolute left-2.5 top-2.5 text-sm text-muted">£</span>
                  <input className="input pl-6 num" aria-label="Extra amount" type="number" min="0" step="0.01" value={m.amount} onChange={(e) => setMod(i, { amount: e.target.value })} disabled={disabled} />
                </div>
                <select className="input" aria-label="Charged" value={m.per} onChange={(e) => setMod(i, { per: e.target.value as Modifier["per"] })} disabled={disabled}>
                  <option value="unit">per {unitLabel(v.unit)}</option>
                  <option value="flat">once per job</option>
                </select>
                {!disabled && (
                  <button type="button" className="rounded-md p-2 text-muted hover:bg-red-50 hover:text-red-600" aria-label="Remove extra" onClick={() => set("modifiers", v.modifiers.filter((_, j) => j !== i))}>
                    <Trash2 className="size-4" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {!readOnly && (dirty || mode === "create") && (
        <div className="sticky bottom-4 z-10 flex items-center gap-3 rounded-xl border border-line bg-ink px-4 py-2.5 text-sm text-white shadow-(--shadow-pop) animate-rise">
          <span className="size-2 rounded-full bg-amber-400" />
          {mode === "create" ? "New item" : "Unsaved changes"}
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
            <button
              type="submit"
              disabled={pending}
              className="flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 font-medium text-ink hover:bg-white/90 disabled:opacity-60"
            >
              {pending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} {mode === "create" ? "Create item" : "Save"}
            </button>
          </div>
        </div>
      )}
    </form>
  );
}
