"use client";

import { CircleAlert, CircleCheck, CircleMinus, KeyRound, PlugZap } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { callApi } from "@/components/json-form";
import { cn } from "@/lib/utils";

export interface SettingView {
  key: string;
  label: string;
  group: string;
  secret: boolean;
  options?: Array<{ value: string; label: string }>;
  placeholder?: string;
  help?: string;
  source: "dashboard" | "env" | null;
  value: string | null;
  envValue: string | null;
}

interface CheckView {
  name: string;
  outcome: "ok" | "fail" | "skip";
  detail: string;
}

function sourceLine(s: SettingView): string {
  if (s.source === "dashboard") return s.secret ? `Saved here: ${s.value}` : "Saved here";
  if (s.source === "env") return s.secret ? `From the server .env: ${s.value}` : `From the server .env: ${s.envValue}`;
  return "Not set";
}

function GroupForm({ group, settings }: { group: { id: string; name: string; summary: string }; settings: SettingView[] }) {
  const router = useRouter();
  // key → new value ("" clears a plain value); secrets also track "remove".
  const [values, setValues] = useState<Record<string, string>>({});
  const [remove, setRemove] = useState<Record<string, boolean>>({});
  const [pending, setPending] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  const save = async () => {
    const changes: Record<string, string | null> = {};
    for (const s of settings) {
      if (s.secret) {
        if (remove[s.key]) changes[s.key] = null;
        else if (values[s.key]?.trim()) changes[s.key] = values[s.key]!.trim();
      } else if (s.key in values) {
        changes[s.key] = values[s.key]!;
      }
    }
    if (Object.keys(changes).length === 0) return setNote({ ok: false, text: "Nothing changed." });
    setPending(true);
    setNote(null);
    const r = await callApi("/api/platform/settings", "PUT", { changes });
    setPending(false);
    if (!r.ok) return setNote({ ok: false, text: r.error?.message ?? "Not saved." });
    setValues({});
    setRemove({});
    setNote({ ok: true, text: "Saved. Every server and worker picks it up within 10 seconds." });
    router.refresh();
  };

  return (
    <details className="rounded-xl border border-wash/[0.08] bg-black/20 p-4" open={group.id === "ai"}>
      <summary className="cursor-pointer select-none">
        <span className="font-semibold">{group.name}</span>
        <span className="mt-0.5 block text-sm text-muted">{group.summary}</span>
      </summary>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        {settings.map((s) => {
          const id = `ps-${s.key}`;
          return (
            <div key={s.key}>
              <label htmlFor={id} className="label flex items-center gap-1.5">
                {s.secret ? <KeyRound className="h-3.5 w-3.5 text-muted" aria-hidden /> : null}
                {s.label}
              </label>
              {s.options ? (
                <select
                  id={id}
                  className="input"
                  value={s.key in values ? values[s.key] : s.source === "dashboard" ? (s.value ?? "") : ""}
                  onChange={(e) => setValues((v) => ({ ...v, [s.key]: e.target.value }))}
                >
                  <option value="">{s.envValue ? `Use the .env value (${s.options.find((o) => o.value === s.envValue)?.label ?? s.envValue})` : "Use the .env value"}</option>
                  {s.options.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              ) : s.secret ? (
                <input
                  id={id}
                  type="password"
                  autoComplete="new-password"
                  spellCheck={false}
                  className="input font-mono"
                  placeholder={s.source ? "Leave blank to keep the current key" : s.placeholder ?? "Paste the key"}
                  value={values[s.key] ?? ""}
                  disabled={remove[s.key]}
                  onChange={(e) => setValues((v) => ({ ...v, [s.key]: e.target.value }))}
                />
              ) : (
                <input
                  id={id}
                  className="input"
                  placeholder={s.envValue ?? s.placeholder ?? ""}
                  value={s.key in values ? values[s.key] : s.source === "dashboard" ? (s.value ?? "") : ""}
                  onChange={(e) => setValues((v) => ({ ...v, [s.key]: e.target.value }))}
                />
              )}
              <p className="mt-1 text-xs text-muted">
                {sourceLine(s)}
                {s.help ? ` · ${s.help}` : ""}
              </p>
              {s.secret && s.source === "dashboard" ? (
                <label className="mt-1 flex items-center gap-2 text-xs text-muted">
                  <input type="checkbox" checked={Boolean(remove[s.key])} onChange={(e) => setRemove((r) => ({ ...r, [s.key]: e.target.checked }))} />
                  Remove the saved key{s.source === "dashboard" ? " (fall back to the .env)" : ""}
                </label>
              ) : null}
            </div>
          );
        })}
      </div>
      {note ? (
        <p role={note.ok ? "status" : "alert"} className={cn("mt-4 rounded-lg border px-3 py-2 text-sm", note.ok ? "border-success/40 bg-success/10 text-success" : "border-danger/40 bg-danger/10 text-danger")}>
          {note.text}
        </p>
      ) : null}
      <button type="button" onClick={() => void save()} disabled={pending} className="btn-primary mt-4">
        {pending ? "Saving…" : `Save ${group.name}`}
      </button>
    </details>
  );
}

/**
 * The platform admin's deployment settings. Keys typed here are sealed on the
 * server and never come back to the browser; the form only ever shows a masked
 * hint of the key in force and where it comes from.
 */
export function PlatformSettingsEditor(props: {
  groups: Array<{ id: string; name: string; summary: string }>;
  settings: SettingView[];
  vaultReady: boolean;
}) {
  const [checks, setChecks] = useState<CheckView[] | null>(null);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const test = async () => {
    setTesting(true);
    setError(null);
    const r = await callApi<{ results: CheckView[] }>("/api/platform/settings/test", "POST", {});
    setTesting(false);
    if (!r.ok || !r.data) return setError(r.error?.message ?? "The checks did not run.");
    setChecks(r.data.results);
  };

  return (
    <div className="space-y-4">
      {!props.vaultReady ? (
        <p className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning">
          CREDENTIALS_KEY is not set on this server, so keys cannot be saved here. Modes and model names still can.
        </p>
      ) : null}
      {props.groups.map((g) => (
        <GroupForm key={g.id} group={g} settings={props.settings.filter((s) => s.group === g.id)} />
      ))}
      <div className="rounded-xl border border-wash/[0.08] p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-semibold">Test connections</p>
            <p className="text-sm text-muted">One harmless live call per provider with the settings above. Nothing is posted or charged.</p>
          </div>
          <button type="button" onClick={() => void test()} disabled={testing} className="btn-quiet">
            <PlugZap className="h-4 w-4" /> {testing ? "Testing…" : "Test connections"}
          </button>
        </div>
        {error ? <p role="alert" className="mt-3 text-sm text-danger">{error}</p> : null}
        {checks ? (
          <ul className="mt-3 divide-y divide-wash/[0.06] text-sm">
            {checks.map((c) => (
              <li key={c.name} className="flex items-start gap-3 py-2">
                {c.outcome === "ok" ? (
                  <CircleCheck className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-label="Passed" />
                ) : c.outcome === "fail" ? (
                  <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-danger" aria-label="Failed" />
                ) : (
                  <CircleMinus className="mt-0.5 h-4 w-4 shrink-0 text-muted" aria-label="Skipped" />
                )}
                <span className="w-32 shrink-0 font-medium">{c.name}</span>
                <span className="min-w-0 flex-1 break-words text-muted">{c.detail}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
