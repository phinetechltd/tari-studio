"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { callApi } from "@/components/json-form";
import { ASSISTANT_TOOLS, type AssistantConfig } from "@/lib/assistant-config";

/**
 * Platform admin editor for the assistant: persona, the model and quota per tier, and the
 * per-tool switches. The fixed safety rules are not editable here — they are code, on purpose.
 * Saving needs two-factor sign-in and is audited.
 */

interface Status {
  config: AssistantConfig;
  custom: boolean;
  updatedAt: string | null;
  updatedBy: string | null;
}

const PROVIDERS = [
  { value: "anthropic", label: "Anthropic (Claude)" },
  { value: "nvidia", label: "NVIDIA hosted" },
  { value: "platform", label: "The deployment's AI chain" },
];

function TierFields(props: {
  title: string;
  tier: "free" | "paid";
  value: AssistantConfig["free"];
  onChange: (next: AssistantConfig["free"]) => void;
}) {
  const v = props.value;
  const num = (raw: string, fallback: number) => {
    const n = Number(raw);
    return Number.isFinite(n) ? Math.round(n) : fallback;
  };
  return (
    <fieldset className="card p-4">
      <legend className="px-1 text-sm font-medium">{props.title}</legend>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor={`${props.tier}-provider`}>Model provider</label>
          <select id={`${props.tier}-provider`} className="input" value={v.provider} onChange={(e) => props.onChange({ ...v, provider: e.target.value as AssistantConfig["free"]["provider"] })}>
            {PROVIDERS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor={`${props.tier}-model`}>Model (blank = the provider's default)</label>
          <input id={`${props.tier}-model`} className="input" value={v.model} maxLength={120} onChange={(e) => props.onChange({ ...v, model: e.target.value })} placeholder="e.g. claude-sonnet-5" />
        </div>
        <div>
          <label className="label" htmlFor={`${props.tier}-tokens`}>Longest answer (tokens)</label>
          <input id={`${props.tier}-tokens`} className="input" type="number" min={200} max={8000} value={v.maxOutputTokens} onChange={(e) => props.onChange({ ...v, maxOutputTokens: num(e.target.value, v.maxOutputTokens) })} />
        </div>
        <div>
          <label className="label" htmlFor={`${props.tier}-daily`}>Messages per person per day</label>
          <input id={`${props.tier}-daily`} className="input" type="number" min={0} max={5000} value={v.dailyMessages} onChange={(e) => props.onChange({ ...v, dailyMessages: num(e.target.value, v.dailyMessages) })} />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={v.vision} onChange={(e) => props.onChange({ ...v, vision: e.target.checked })} className="h-4 w-4" />
          Can read attached pictures
        </label>
      </div>
    </fieldset>
  );
}

export function AssistantEditor({ initial }: { initial: Status }) {
  const router = useRouter();
  const [c, setC] = useState<AssistantConfig>(initial.config);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const set = <K extends keyof AssistantConfig>(k: K, val: AssistantConfig[K]) => setC((s) => ({ ...s, [k]: val }));

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy("save");
    setError(null);
    setDone(null);
    const res = await callApi<AssistantConfig>("/api/platform/assistant", "PUT", { config: c });
    setBusy(null);
    if (!res.ok) {
      setError(res.error?.message ?? "Something went wrong.");
      return;
    }
    if (res.data) setC(res.data);
    setDone("Saved. It applies to everyone within a few seconds.");
    router.refresh();
  }

  async function reset() {
    setBusy("reset");
    setError(null);
    setDone(null);
    const res = await callApi<AssistantConfig>("/api/platform/assistant", "DELETE");
    setBusy(null);
    if (!res.ok) {
      setError(res.error?.message ?? "Something went wrong.");
      return;
    }
    if (res.data) setC(res.data);
    setDone("Back to the built-in defaults.");
    router.refresh();
  }

  return (
    <form onSubmit={save} className="space-y-4">
      <div className="card p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label className="flex items-center gap-2 text-sm font-medium">
            <input type="checkbox" checked={c.enabled} onChange={(e) => set("enabled", e.target.checked)} className="h-4 w-4" />
            Assistant is on
          </label>
          <p className="text-xs text-muted">
            {initial.custom ? `Customised${initial.updatedBy ? ` by ${initial.updatedBy}` : ""}${initial.updatedAt ? ` · ${new Date(initial.updatedAt).toLocaleString("en-KE")}` : ""}` : "Running on the built-in defaults"}
          </p>
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="assistant-name">Name people see</label>
            <input id="assistant-name" className="input" value={c.name} maxLength={40} onChange={(e) => set("name", e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="assistant-welcome">Welcome line</label>
            <input id="assistant-welcome" className="input" value={c.welcome} maxLength={400} onChange={(e) => set("welcome", e.target.value)} />
          </div>
        </div>
        <div className="mt-4">
          <label className="label" htmlFor="assistant-persona">Persona (style notes; can never loosen the fixed safety rules)</label>
          <textarea id="assistant-persona" className="input min-h-[88px]" value={c.persona} maxLength={2500} onChange={(e) => set("persona", e.target.value)} />
        </div>
      </div>

      <TierFields title="Standard tier (everyone)" tier="free" value={c.free} onChange={(v) => set("free", v)} />
      <TierFields title="Premium tier (active plan, or credits bought in the last 90 days)" tier="paid" value={c.paid} onChange={(v) => set("paid", v)} />

      <fieldset className="card p-4">
        <legend className="px-1 text-sm font-medium">Tools</legend>
        <p className="mb-3 text-xs text-muted">Tools make changes only as proposals; the person presses Apply before anything is saved.</p>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-muted">
              <th className="py-1 pr-2 font-medium">Tool</th>
              <th className="py-1 pr-2 font-medium">On</th>
              <th className="py-1 font-medium">Premium only</th>
            </tr>
          </thead>
          <tbody>
            {ASSISTANT_TOOLS.map((t) => (
              <tr key={t.key} className="border-t border-line">
                <td className="py-2 pr-2">
                  <span className="font-medium">{t.label}</span>
                  <span className="block text-xs text-muted">{t.description}</span>
                </td>
                <td className="py-2 pr-2">
                  <input
                    type="checkbox"
                    className="h-4 w-4"
                    aria-label={`${t.label}: on`}
                    checked={c.tools[t.key]?.enabled ?? false}
                    onChange={(e) => set("tools", { ...c.tools, [t.key]: { ...c.tools[t.key], enabled: e.target.checked, paidOnly: c.tools[t.key]?.paidOnly ?? false } })}
                  />
                </td>
                <td className="py-2">
                  <input
                    type="checkbox"
                    className="h-4 w-4"
                    aria-label={`${t.label}: premium only`}
                    checked={c.tools[t.key]?.paidOnly ?? false}
                    onChange={(e) => set("tools", { ...c.tools, [t.key]: { ...c.tools[t.key], enabled: c.tools[t.key]?.enabled ?? true, paidOnly: e.target.checked } })}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </fieldset>

      <fieldset className="card p-4">
        <legend className="px-1 text-sm font-medium">Safety limits</legend>
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className="label" htmlFor="max-steps">Most tool steps per answer</label>
            <input id="max-steps" className="input" type="number" min={1} max={5} value={c.maxToolSteps} onChange={(e) => set("maxToolSteps", Math.max(1, Math.min(5, Number(e.target.value) || c.maxToolSteps)))} />
          </div>
          <div>
            <label className="label" htmlFor="max-chars">Longest message (characters)</label>
            <input id="max-chars" className="input" type="number" min={200} max={8000} value={c.maxInputChars} onChange={(e) => set("maxInputChars", Math.max(200, Math.min(8000, Number(e.target.value) || c.maxInputChars)))} />
          </div>
          <div>
            <label className="label" htmlFor="per-minute">Messages per person per minute</label>
            <input id="per-minute" className="input" type="number" min={1} max={60} value={c.perMinute} onChange={(e) => set("perMinute", Math.max(1, Math.min(60, Number(e.target.value) || c.perMinute)))} />
          </div>
        </div>
      </fieldset>

      {error ? (
        <p role="alert" className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      ) : null}
      {done ? (
        <p role="status" className="rounded-lg border border-success/40 bg-success/10 px-3 py-2 text-sm text-success">
          {done}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-3">
        <button type="submit" disabled={busy !== null} className="btn-primary">
          {busy === "save" ? "Saving…" : "Save assistant settings"}
        </button>
        <button type="button" disabled={busy !== null} onClick={() => void reset()} className="rounded-lg border border-line px-4 py-2 text-sm text-muted hover:bg-raised">
          {busy === "reset" ? "Resetting…" : "Reset to defaults"}
        </button>
      </div>
    </form>
  );
}
