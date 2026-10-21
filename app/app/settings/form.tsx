"use client";

import { useActionState, useState } from "react";
import { saveAiSettings } from "./actions";

export function AiSettingsForm({ defaults, current }: { defaults: Record<string, string>; current: string }) {
  const [state, action, pending] = useActionState(saveAiSettings, null);
  const [provider, setProvider] = useState(current);

  return (
    <form action={action} className="space-y-3" autoComplete="off">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="provider">Provider</label>
          <select id="provider" name="provider" className="input" value={provider} onChange={(e) => setProvider(e.target.value)}>
            <option value="anthropic">Anthropic</option>
            <option value="openai">OpenAI</option>
          </select>
        </div>
        <div>
          <label className="label" htmlFor="model">Model</label>
          <input id="model" name="model" className="input font-mono" key={provider} defaultValue={defaults[provider]} required />
        </div>
      </div>
      <div>
        <label className="label" htmlFor="apiKey">API key</label>
        <input id="apiKey" name="apiKey" type="password" className="input font-mono" placeholder="Paste a new key" required />
      </div>
      {state && <p className={`text-sm ${state.ok ? "text-emerald-700" : "text-red-700"}`}>{state.message}</p>}
      <button className="btn-primary" disabled={pending}>
        {pending ? "Checking key…" : "Test & save key"}
      </button>
    </form>
  );
}
