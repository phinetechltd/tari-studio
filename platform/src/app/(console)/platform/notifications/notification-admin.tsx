"use client";

import { RotateCcw, Save, Send } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { callApi } from "@/components/json-form";
import { Badge } from "@/components/ui";

type Message = { tone: "ok" | "error"; text: string } | null;
type Channel = "IN_APP" | "EMAIL" | "SMS";

function Feedback({ message }: { message: Message }) {
  if (!message) return null;
  return (
    <p role={message.tone === "error" ? "alert" : "status"} className={message.tone === "error" ? "mt-3 text-sm text-red-300" : "mt-3 text-sm text-success"}>
      {message.text}
    </p>
  );
}

export interface PolicyEvent {
  key: string;
  label: string;
  description: string;
  group: string;
  essential: boolean;
  audience: string;
  defaults: Record<Channel, boolean>;
}

const AUDIENCE: Record<string, string> = {
  owners: "Owners",
  managers: "Owners, brand managers",
  team: "Owners, managers, marketers",
  person: "The person involved",
  platform: "Platform admins",
};

/** Which channels each event uses, for everyone. People can still opt out of non-essential ones. */
export function PolicyMatrix({ events, policy, smsMode, emailMode }: { events: PolicyEvent[]; policy: Record<string, Record<Channel, boolean>>; smsMode: string; emailMode: string }) {
  const router = useRouter();
  const [state, setState] = useState(policy);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Message>(null);
  const groups = Array.from(new Set(events.map((e) => e.group)));
  const changed = JSON.stringify(state) !== JSON.stringify(policy);

  async function save() {
    setBusy(true);
    setMessage(null);
    const r = await callApi("/api/platform/notifications/policy", "PUT", { policy: state });
    setBusy(false);
    if (!r.ok) return setMessage({ tone: "error", text: r.error?.message ?? "Could not save." });
    setMessage({ tone: "ok", text: "Saved. New notifications follow these settings." });
    router.refresh();
  }

  function reset() {
    setState(Object.fromEntries(events.map((e) => [e.key, { ...e.defaults }])));
  }

  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-line text-left text-muted">
              <th className="px-4 py-2 font-medium">Event</th>
              <th className="px-4 py-2 font-medium">Goes to</th>
              <th className="w-24 px-4 py-2 text-center font-medium">In the app</th>
              <th className="w-24 px-4 py-2 text-center font-medium">
                Email{emailMode === "console" ? <span className="block text-[10px] font-normal">(console)</span> : null}
              </th>
              <th className="w-24 px-4 py-2 text-center font-medium">
                SMS{smsMode !== "bonga" ? <span className="block text-[10px] font-normal">({smsMode})</span> : null}
              </th>
            </tr>
          </thead>
          {groups.map((g) => (
            <tbody key={g}>
              <tr>
                <th colSpan={5} className="bg-white/[0.02] px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider text-muted">
                  {g}
                </th>
              </tr>
              {events
                .filter((e) => e.group === g)
                .map((e) => (
                  <tr key={e.key} className="border-b border-line last:border-0">
                    <td className="px-4 py-2.5">
                      <span className="font-medium">{e.label}</span>
                      {e.essential ? (
                        <span className="ml-2">
                          <Badge>Essential</Badge>
                        </span>
                      ) : null}
                      <span className="block text-xs text-muted">{e.description}</span>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-muted">{AUDIENCE[e.audience] ?? e.audience}</td>
                    {(["IN_APP", "EMAIL", "SMS"] as const).map((c) => (
                      <td key={c} className="px-4 py-2.5 text-center">
                        <input
                          type="checkbox"
                          className="h-4 w-4 accent-violet-500"
                          aria-label={`${e.label}: ${c === "IN_APP" ? "in the app" : c === "EMAIL" ? "email" : "SMS"}`}
                          checked={state[e.key]?.[c] ?? false}
                          disabled={busy}
                          onChange={(ev) => setState((s) => ({ ...s, [e.key]: { ...s[e.key]!, [c]: ev.target.checked } }))}
                        />
                        {state[e.key]?.[c] !== e.defaults[c] ? <span className="sr-only"> (changed from default)</span> : null}
                      </td>
                    ))}
                  </tr>
                ))}
            </tbody>
          ))}
        </table>
      </div>
      <div className="flex flex-wrap items-center gap-2 border-t border-white/[0.06] p-4">
        <button type="button" onClick={save} disabled={busy || !changed} className="btn-primary">
          <Save className="h-4 w-4" /> {busy ? "Saving…" : "Save channels"}
        </button>
        <button type="button" onClick={reset} disabled={busy} className="btn-quiet">
          <RotateCcw className="h-4 w-4" /> Back to defaults
        </button>
        <span className="text-xs text-muted">SMS costs money per text; by default only urgent events use it.</span>
      </div>
      <div className="px-4 pb-4">
        <Feedback message={message} />
      </div>
    </div>
  );
}

/** Sends one test message with the settings in force, logged like any delivery. */
export function TestSend({ defaultEmail, defaultPhone }: { defaultEmail: string; defaultPhone: string | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState<"EMAIL" | "SMS" | null>(null);
  const [message, setMessage] = useState<Message>(null);

  async function send(e: FormEvent<HTMLFormElement>, channel: "EMAIL" | "SMS") {
    e.preventDefault();
    const to = String(new FormData(e.currentTarget).get("to") ?? "");
    setBusy(channel);
    setMessage(null);
    const r = await callApi<{ status: string; error: string | null; mock: boolean; provider: string | null }>("/api/platform/notifications/test", "POST", { channel, to });
    setBusy(null);
    if (!r.ok || !r.data) return setMessage({ tone: "error", text: r.error?.message ?? "Could not send." });
    const d = r.data;
    setMessage(
      d.status === "SENT"
        ? { tone: "ok", text: d.mock ? `Logged by the ${d.provider ?? "console"} stand-in (nothing left the server). Switch to a live provider in Settings.` : `Sent through ${d.provider}. Check the ${channel === "EMAIL" ? "inbox" : "phone"}.` }
        : { tone: "error", text: `Not sent: ${d.error ?? d.status}` },
    );
    router.refresh();
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <form onSubmit={(e) => send(e, "EMAIL")} className="card p-5">
        <label className="label" htmlFor="test-email">Send a test email to</label>
        <div className="flex gap-2">
          <input id="test-email" name="to" type="email" required defaultValue={defaultEmail} className="input" />
          <button type="submit" disabled={busy !== null} className="btn-primary shrink-0">
            <Send className="h-4 w-4" /> {busy === "EMAIL" ? "Sending…" : "Send"}
          </button>
        </div>
      </form>
      <form onSubmit={(e) => send(e, "SMS")} className="card p-5">
        <label className="label" htmlFor="test-sms">Send a test SMS to</label>
        <div className="flex gap-2">
          <input id="test-sms" name="to" required inputMode="tel" placeholder="0712 345 678" defaultValue={defaultPhone ? `+${defaultPhone}` : ""} className="input" />
          <button type="submit" disabled={busy !== null} className="btn-primary shrink-0">
            <Send className="h-4 w-4" /> {busy === "SMS" ? "Sending…" : "Send"}
          </button>
        </div>
      </form>
      <div className="md:col-span-2">
        <Feedback message={message} />
      </div>
    </div>
  );
}

/** Re-queues one failed or held-back delivery. */
export function RetryButton({ id }: { id: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="inline-flex flex-col items-end">
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          const r = await callApi(`/api/platform/notifications/deliveries/${id}/retry`, "POST", {});
          setBusy(false);
          if (!r.ok) setError(r.error?.message ?? "Could not retry.");
          else router.refresh();
        }}
        className="rounded-full px-2.5 py-1 text-xs font-medium text-primary hover:bg-white/[0.06]"
      >
        {busy ? "Queuing…" : "Retry"}
      </button>
      {error ? <span className="max-w-[200px] text-right text-[11px] text-red-300">{error}</span> : null}
    </span>
  );
}
