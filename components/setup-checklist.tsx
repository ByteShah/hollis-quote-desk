import Link from "next/link";
import { Check, ChevronRight } from "lucide-react";
import { getTenant } from "@/lib/tenant";
import { cn } from "./ui";

type Status = { rules: boolean; ai_key: boolean; rates: number; customers: number; team: number; quotes: number };

/** Getting-started steps for a new company. Hidden once it has drafted a quote. */
export async function SetupChecklist() {
  const { supabase, company, can } = await getTenant();
  const { data } = await supabase.rpc("company_setup_status", { cid: company.id });
  const s = data as Status | null;
  if (!s || (s.ai_key && s.rates > 0 && s.quotes > 0)) return null;

  const steps = [
    { done: s.rules, label: "Check your company details and quoting rules", href: "/app/settings", who: can("company.settings") },
    { done: s.ai_key, label: "Add your OpenAI or Anthropic key", href: "/app/settings/ai", who: can("company.settings") },
    { done: s.rates > 0, label: "Load your price list", hint: "Import a CSV or add items", href: "/app/rates/import", who: can("data.import") },
    { done: s.customers > 0, label: "Add your customers", hint: "Optional, helps match repeat customers", href: "/app/customers/import", who: can("data.import") },
    { done: s.team > 1, label: "Invite your team", hint: "Optional", href: "/app/settings/team", who: can("team.manage") },
    { done: s.quotes > 0, label: "Draft your first quote", href: "/app/quotes/new", who: true },
  ];
  const done = steps.filter((x) => x.done).length;

  return (
    <section className="card mb-6 overflow-hidden">
      <header className="flex flex-wrap items-center gap-3 border-b border-line/70 px-5 py-3.5">
        <h2 className="text-sm font-semibold">Get {company.name} set up</h2>
        <span className="text-xs text-muted num">{done} of {steps.length} done</span>
        <div className="ml-auto h-1.5 w-40 overflow-hidden rounded-full bg-sunken" aria-hidden>
          <div className="h-full rounded-full bg-brand transition-all" style={{ width: `${(done / steps.length) * 100}%` }} />
        </div>
      </header>
      <ol className="divide-y divide-line/70">
        {steps.map((st) => {
          const body = (
            <>
              <span className={cn("grid size-6 shrink-0 place-items-center rounded-full ring-1", st.done ? "bg-brand text-white ring-brand" : "bg-surface ring-line-strong")}>
                {st.done && <Check className="size-3.5" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className={cn("block text-sm", st.done ? "text-muted line-through decoration-line-strong" : "text-ink")}>{st.label}</span>
                {st.hint && !st.done && <span className="block text-xs text-muted">{st.hint}</span>}
              </span>
              {!st.done && (st.who ? <ChevronRight className="size-4 text-muted" /> : <span className="text-xs text-muted">Ask an owner</span>)}
            </>
          );
          return (
            <li key={st.label}>
              {!st.done && st.who ? (
                <Link href={st.href} className="flex items-center gap-3 px-5 py-3 transition hover:bg-sunken/50">{body}</Link>
              ) : (
                <div className="flex items-center gap-3 px-5 py-3">{body}</div>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
