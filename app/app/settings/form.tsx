"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Eye, EyeOff, Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { buttonClass, cn } from "@/components/ui";
import { saveAiSettings } from "./actions";

const PROVIDERS = [
  { id: "anthropic", name: "Anthropic", hint: "Claude models · keys start with sk-ant-" },
  { id: "openai", name: "OpenAI", hint: "GPT models · keys start with sk-" },
];

export function AiSettingsForm({
  defaults,
  current,
  currentModel,
  replacing,
}: {
  defaults: Record<string, string>;
  current: string;
  currentModel: string | null;
  replacing: boolean;
}) {
  const [state, action, pending] = useActionState(saveAiSettings, null);
  const [provider, setProvider] = useState(current);
  const [show, setShow] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (!state) return;
    if (state.ok) {
      toast.success(state.message);
      formRef.current?.reset();
    } else toast.error(state.message);
  }, [state]);

  const model = provider === current && currentModel ? currentModel : defaults[provider];

  return (
    <form ref={formRef} action={action} className="space-y-5" autoComplete="off">
      <fieldset>
        <legend className="label">Provider</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {PROVIDERS.map((p) => (
            <label
              key={p.id}
              className={cn(
                "flex cursor-pointer items-start gap-3 rounded-xl border px-4 py-3 transition",
                provider === p.id ? "border-brand bg-brand-soft/40 ring-4 ring-brand/10" : "border-line-strong hover:bg-sunken/60",
              )}
            >
              <input
                type="radio"
                name="provider"
                value={p.id}
                checked={provider === p.id}
                onChange={() => setProvider(p.id)}
                className="mt-1 accent-(--color-brand)"
              />
              <span>
                <span className="block text-sm font-medium">{p.name}</span>
                <span className="block text-xs text-muted">{p.hint}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-[1fr_1.4fr]">
        <div>
          <label className="label" htmlFor="model">Model</label>
          <input id="model" name="model" className="input font-mono text-[13px]" key={provider} defaultValue={model} required spellCheck={false} />
        </div>
        <div>
          <label className="label" htmlFor="apiKey">{replacing ? "New API key" : "API key"}</label>
          <div className="relative">
            <input
              id="apiKey"
              name="apiKey"
              type={show ? "text" : "password"}
              className="input pr-10 font-mono text-[13px]"
              placeholder={provider === "anthropic" ? "sk-ant-…" : "sk-…"}
              required
              spellCheck={false}
              autoComplete="off"
              data-1p-ignore
            />
            <button
              type="button"
              onClick={() => setShow((s) => !s)}
              className="absolute inset-y-0 right-0 grid w-10 place-items-center text-muted hover:text-ink"
              aria-label={show ? "Hide key" : "Show key"}
            >
              {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t border-line/70 pt-4">
        <button className={buttonClass("primary")} disabled={pending}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />}
          {pending ? "Testing key…" : replacing ? "Test & replace key" : "Test & save key"}
        </button>
        <span className="text-xs text-muted">We make one tiny test call to check the key works before saving it.</span>
      </div>
    </form>
  );
}
