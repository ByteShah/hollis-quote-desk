"use client";

import { useActionState, useEffect } from "react";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { buttonClass } from "@/components/ui";
import { updateCompany } from "./actions";

type Values = { name: string; min_charge: number; vat_percent: number; auto_quote_max_m2: number; price_review_months: number; quoting_rules: string };

export function CompanyForm({ initial, readOnly }: { initial: Values; readOnly: boolean }) {
  const [state, action, pending] = useActionState(updateCompany, null);
  useEffect(() => {
    if (state) (state.ok ? toast.success : toast.error)(state.message);
  }, [state]);

  const num = (name: keyof Values, label: string, prefix: string | null, suffix: string | null, props: React.InputHTMLAttributes<HTMLInputElement>) => (
    <div>
      <label className="label" htmlFor={name}>{label}</label>
      <div className="relative">
        {prefix && <span className="pointer-events-none absolute left-3 top-2.5 text-sm text-muted">{prefix}</span>}
        <input id={name} name={name} type="number" defaultValue={initial[name] as number} disabled={readOnly} required className={`input num ${prefix ? "pl-7" : ""} ${suffix ? "pr-16" : ""}`} {...props} />
        {suffix && <span className="pointer-events-none absolute right-3 top-2.5 text-[13px] text-muted">{suffix}</span>}
      </div>
    </div>
  );

  return (
    <form action={action} className="space-y-5">
      <div>
        <label className="label" htmlFor="name">Company name</label>
        <input id="name" name="name" className="input" defaultValue={initial.name} disabled={readOnly} required maxLength={120} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {num("min_charge", "Minimum charge per job (ex VAT)", "£", null, { min: 0, step: "0.01" })}
        {num("vat_percent", "VAT rate", null, "%", { min: 0, max: 50, step: "0.01" })}
        {num("auto_quote_max_m2", "Site visit for jobs over", null, "m²", { min: 1, step: "1" })}
        {num("price_review_months", "Flag prices not reviewed for", null, "months", { min: 1, max: 36, step: "1" })}
      </div>
      <div>
        <label className="label" htmlFor="quoting_rules">Quoting rules for the AI</label>
        <textarea id="quoting_rules" name="quoting_rules" rows={10} className="input h-auto py-2 font-mono text-[13px] leading-relaxed" defaultValue={initial.quoting_rules} disabled={readOnly} maxLength={4000} />
        <p className="mt-1 text-xs text-muted">One rule per line. Plain English works best, e.g. &ldquo;We don&apos;t do dropped kerbs: tell the customer to apply to the council.&rdquo;</p>
      </div>
      {readOnly ? (
        <p className="text-sm text-muted">Only an owner can change these.</p>
      ) : (
        <button className={buttonClass("primary")} disabled={pending}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} Save settings
        </button>
      )}
    </form>
  );
}
