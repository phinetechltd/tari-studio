"use client";

import { Lightbulb, RotateCcw, Save } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { callApi } from "@/components/json-form";
import { Badge } from "@/components/ui";

type Message = { tone: "ok" | "error"; text: string } | null;

function Feedback({ message }: { message: Message }) {
  if (!message) return null;
  return (
    <p role={message.tone === "error" ? "alert" : "status"} className={message.tone === "error" ? "mt-3 text-sm text-red-300" : "mt-3 text-sm text-success"}>
      {message.text}
    </p>
  );
}

/** Name and the mobile number SMS notifications go to. */
export function ProfileForm({ name, email, phone }: { name: string; email: string; phone: string | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Message>(null);
  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const d = new FormData(e.currentTarget);
    setBusy(true);
    setMessage(null);
    const r = await callApi("/api/account/profile", "PATCH", { name: String(d.get("name") ?? ""), phone: String(d.get("phone") ?? "") });
    setBusy(false);
    if (!r.ok) return setMessage({ tone: "error", text: r.error?.message ?? "Could not save." });
    setMessage({ tone: "ok", text: "Saved." });
    router.refresh();
  }
  return (
    <form onSubmit={onSubmit} className="card max-w-xl p-5">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="label" htmlFor="profile-name">Name</label>
          <input id="profile-name" name="name" required minLength={2} maxLength={80} defaultValue={name} className="input" autoComplete="name" />
        </div>
        <div>
          <label className="label" htmlFor="profile-email">Email</label>
          <input id="profile-email" value={email} readOnly className="input opacity-70" />
        </div>
        <div>
          <label className="label" htmlFor="profile-phone">Mobile number</label>
          <input id="profile-phone" name="phone" defaultValue={phone ? `+${phone}` : ""} placeholder="0712 345 678" inputMode="tel" autoComplete="tel" className="input" />
        </div>
      </div>
      <p className="mt-2 text-xs text-muted">Used only for urgent notifications by SMS. Leave it empty to receive none.</p>
      <button type="submit" disabled={busy} className="btn-primary mt-4">
        <Save className="h-4 w-4" /> {busy ? "Saving…" : "Save profile"}
      </button>
      <Feedback message={message} />
    </form>
  );
}

export interface PrefEvent {
  key: string;
  label: string;
  description: string;
  group: string;
  essential: boolean;
  channels: Record<"EMAIL" | "SMS", { available: boolean; enabled: boolean; locked: boolean }>;
}

/** Which events also reach the person by email or SMS. Essential ones are locked on. */
export function PreferencesForm({ events, hasPhone, smsOn }: { events: PrefEvent[]; hasPhone: boolean; smsOn: boolean }) {
  const [state, setState] = useState(() => Object.fromEntries(events.map((e) => [e.key, { EMAIL: e.channels.EMAIL.enabled, SMS: e.channels.SMS.enabled }])));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Message>(null);
  const groups = Array.from(new Set(events.map((e) => e.group)));

  async function save() {
    setBusy(true);
    setMessage(null);
    const items = events.flatMap((e) =>
      (["EMAIL", "SMS"] as const).filter((c) => e.channels[c].available && !e.channels[c].locked).map((c) => ({ event: e.key, channel: c, enabled: state[e.key]![c] })),
    );
    const r = await callApi("/api/account/notifications", "PUT", { items });
    setBusy(false);
    setMessage(r.ok ? { tone: "ok", text: "Notification settings saved." } : { tone: "error", text: r.error?.message ?? "Could not save." });
  }

  if (events.length === 0) return <p className="text-sm text-muted">No notifications apply to your role.</p>;

  return (
    <div className="card overflow-hidden">
      {!hasPhone && smsOn ? (
        <p className="border-b border-white/[0.06] px-4 py-3 text-sm text-amber-200">Add a mobile number above to receive SMS.</p>
      ) : null}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="border-b border-line text-left text-muted">
              <th className="px-4 py-2 font-medium">Event</th>
              <th className="w-24 px-4 py-2 text-center font-medium">In the app</th>
              <th className="w-24 px-4 py-2 text-center font-medium">Email</th>
              <th className="w-24 px-4 py-2 text-center font-medium">SMS</th>
            </tr>
          </thead>
          {groups.map((g) => (
            <tbody key={g}>
              <tr>
                <th colSpan={4} className="bg-white/[0.02] px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider text-muted">
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
                          <Badge>Always on</Badge>
                        </span>
                      ) : null}
                      <span className="block text-xs text-muted">{e.description}</span>
                    </td>
                    <td className="px-4 py-2.5 text-center text-muted">✓</td>
                    {(["EMAIL", "SMS"] as const).map((c) => {
                      const ch = e.channels[c];
                      if (!ch.available || (c === "SMS" && !smsOn)) {
                        return (
                          <td key={c} className="px-4 py-2.5 text-center text-xs text-muted" title="Switched off for everyone by the platform">
                            —
                          </td>
                        );
                      }
                      return (
                        <td key={c} className="px-4 py-2.5 text-center">
                          <input
                            type="checkbox"
                            className="h-4 w-4 accent-violet-500"
                            aria-label={`${e.label} by ${c === "EMAIL" ? "email" : "SMS"}`}
                            checked={state[e.key]![c]}
                            disabled={ch.locked || busy}
                            onChange={(ev) => setState((s) => ({ ...s, [e.key]: { ...s[e.key]!, [c]: ev.target.checked } }))}
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
            </tbody>
          ))}
        </table>
      </div>
      <div className="border-t border-white/[0.06] p-4">
        <button type="button" onClick={save} disabled={busy} className="btn-primary">
          <Save className="h-4 w-4" /> {busy ? "Saving…" : "Save notification settings"}
        </button>
        <Feedback message={message} />
      </div>
    </div>
  );
}

/** First-use tips on or off, and "show them all again". */
export function TipsForm({ enabled, dismissed }: { enabled: boolean; dismissed: number }) {
  const router = useRouter();
  const [on, setOn] = useState(enabled);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Message>(null);
  async function send(body: unknown, ok: string) {
    setBusy(true);
    setMessage(null);
    const r = await callApi("/api/account/hints", "PATCH", body);
    setBusy(false);
    if (!r.ok) return setMessage({ tone: "error", text: r.error?.message ?? "Could not save." });
    setMessage({ tone: "ok", text: ok });
    router.refresh();
  }
  return (
    <div className="card max-w-xl p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex gap-3">
          <Lightbulb className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden />
          <div>
            <p className="font-medium" id="tips-label">Show tips</p>
            <p className="text-sm text-muted">Short pointers the first time you open a page.</p>
          </div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-labelledby="tips-label"
          disabled={busy}
          onClick={() => {
            const next = !on;
            setOn(next);
            void send({ enabled: next }, next ? "Tips are on." : "Tips are off.");
          }}
          className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${on ? "bg-primary" : "bg-white/15"}`}
        >
          <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${on ? "translate-x-5" : "translate-x-0.5"}`} />
        </button>
      </div>
      {dismissed > 0 ? (
        <button type="button" disabled={busy} onClick={() => void send({ reset: true }, "All tips will show again.").then(() => setOn(true))} className="btn-quiet mt-4 text-sm">
          <RotateCcw className="h-4 w-4" /> Show the {dismissed} dismissed tip{dismissed === 1 ? "" : "s"} again
        </button>
      ) : null}
      <Feedback message={message} />
    </div>
  );
}
