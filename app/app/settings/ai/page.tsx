import type { Metadata } from "next";
import { KeyRound, ShieldCheck } from "lucide-react";
import { getTenant } from "@/lib/tenant";
import { DEFAULT_MODELS } from "@/lib/ai/provider";
import { Badge, Card } from "@/components/ui";
import { AiSettingsForm } from "./form";

export const metadata: Metadata = { title: "AI provider" };

export default async function SettingsPage() {
  const { supabase, company, can } = await getTenant();
  // Security-definer function: provider, model and last 4 only. Never the key.
  const { data } = await supabase.rpc("get_ai_settings_public", { cid: company.id });
  const current = data?.[0] as { provider: string; model: string; key_last4: string; updated_at: string } | undefined;

  return (
    <div className="animate-rise">
      <div className="grid items-start gap-5 lg:grid-cols-[1fr_340px]">
        <Card
          title="AI provider"
          icon={KeyRound}
          action={current ? <Badge tone="success" dot>Connected</Badge> : <Badge tone="warning" dot>Not set up</Badge>}
        >
          {current ? (
            <div className="mb-5 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl bg-sunken/70 px-4 py-3 text-sm">
              <div>
                <div className="text-xs text-muted">Provider</div>
                <div className="font-medium capitalize">{current.provider}</div>
              </div>
              <div>
                <div className="text-xs text-muted">Model</div>
                <div className="font-mono text-[13px]">{current.model}</div>
              </div>
              <div>
                <div className="text-xs text-muted">Key</div>
                <div className="font-mono text-[13px]">••••••••{current.key_last4}</div>
              </div>
              <div className="ml-auto text-xs text-muted">
                Updated {new Date(current.updated_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
              </div>
            </div>
          ) : (
            <p className="mb-5 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200">
              Add your company&apos;s OpenAI or Anthropic key to start drafting quotes. Usage is billed to your own account.
            </p>
          )}

          {can("company.settings") ? (
            <AiSettingsForm defaults={DEFAULT_MODELS} current={current?.provider ?? "anthropic"} currentModel={current?.model ?? null} replacing={!!current} />
          ) : (
            <p className="text-sm text-muted">Only an account owner can change the AI key.</p>
          )}
        </Card>

        <div className="space-y-5">
          <Card title="How your key is protected" icon={ShieldCheck}>
            <ul className="space-y-2.5 text-[13px] leading-relaxed text-ink-2">
              <li>It&apos;s tested with the provider before it&apos;s saved.</li>
              <li>It&apos;s encrypted (AES-256-GCM) and tied to your company, so it can&apos;t be used for anyone else.</li>
              <li>It&apos;s never shown again or sent to the browser, only the last 4 characters.</li>
              <li>It&apos;s only used on the server, for your company&apos;s quotes.</li>
            </ul>
          </Card>

        </div>
      </div>
    </div>
  );
}
