import { getTenant } from "@/lib/tenant";
import { DEFAULT_MODELS } from "@/lib/ai/provider";
import { formatGBP } from "@/lib/quote/money";
import { AiSettingsForm } from "./form";

export default async function SettingsPage() {
  const { supabase, company, role } = await getTenant();
  // Security-definer function: returns provider/model/last 4 only, never the key.
  const { data } = await supabase.rpc("get_ai_settings_public", { cid: company.id });
  const current = data?.[0] as { provider: string; model: string; key_last4: string; updated_at: string } | undefined;

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-xl font-semibold">Settings</h1>

      <section className="card space-y-4">
        <div>
          <h2 className="font-medium">AI provider</h2>
          <p className="text-sm text-stone-500">
            Quotes for {company.name} use your own OpenAI or Anthropic key. It is encrypted before it&apos;s stored and is
            never shown again or sent to the browser.
          </p>
        </div>
        {current ? (
          <p className="rounded-md bg-stone-50 px-3 py-2 text-sm">
            Using <strong>{current.provider}</strong> · <span className="font-mono">{current.model}</span> · key ending{" "}
            <span className="font-mono">…{current.key_last4}</span>
            <span className="text-stone-500"> · updated {new Date(current.updated_at).toLocaleString("en-GB")}</span>
          </p>
        ) : (
          <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">No key yet. Add one to start drafting quotes.</p>
        )}
        {role === "owner" ? (
          <AiSettingsForm defaults={DEFAULT_MODELS} current={current?.provider ?? "anthropic"} />
        ) : (
          <p className="text-sm text-stone-500">Ask an account owner to change the key.</p>
        )}
      </section>

      <section className="card space-y-1 text-sm">
        <h2 className="font-medium">Quoting rules</h2>
        <p>Minimum charge: {formatGBP(company.min_charge)} · VAT: {company.vat_rate * 100}% (quotes are ex VAT, VAT shown separately)</p>
        <p>Jobs over {company.auto_quote_max_m2} m² always go to a site visit.</p>
        <pre className="mt-2 whitespace-pre-wrap rounded-md bg-stone-50 p-3 font-sans text-stone-700">{company.quoting_rules}</pre>
      </section>
    </div>
  );
}
