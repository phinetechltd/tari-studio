"use client";

import { Check, LoaderIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { PasswordField } from "@/components/auth/password-field";
import { callApi } from "@/components/json-form";

type Msg = { tone: "ok" | "error"; text: string } | null;
const Feedback = ({ m }: { m: Msg }) =>
  m ? (
    <p role={m.tone === "error" ? "alert" : "status"} className={`mt-3 text-sm ${m.tone === "error" ? "text-danger" : "text-success"}`}>
      {m.text}
    </p>
  ) : null;

/** Change your password, or set one if you signed up with Google. */
export function PasswordForm({ hasPassword }: { hasPassword: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const form = e.currentTarget;
    const f = new FormData(form);
    const res = await callApi("/api/account/password", "POST", { current: f.get("current") || undefined, password: f.get("password") });
    setBusy(false);
    if (res.ok) {
      form.reset();
      setMsg({ tone: "ok", text: "Password saved. Your other devices were signed out." });
      router.refresh();
    } else setMsg({ tone: "error", text: res.error?.message ?? "Could not change the password." });
  }
  return (
    <form onSubmit={submit} className="card max-w-xl space-y-4 p-5">
      {hasPassword ? (
        <PasswordField id="current" name="current" label="Current password" autoComplete="current-password" />
      ) : (
        <p className="text-sm text-muted">You signed in with Google, so you have no password yet. Set one to sign in with your email too.</p>
      )}
      <PasswordField id="newpw" name="password" label={hasPassword ? "New password" : "Choose a password"} autoComplete="new-password" showHint />
      <button type="submit" disabled={busy} className="btn-primary">
        {busy ? <LoaderIcon className="h-4 w-4 animate-spin" /> : null} {hasPassword ? "Change password" : "Set password"}
      </button>
      <Feedback m={msg} />
    </form>
  );
}

/** Confirm the phone number on your profile with a text, so it can receive password-recovery codes. */
export function PhoneVerify({ phone, verified }: { phone: string | null; verified: boolean }) {
  const router = useRouter();
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  if (!phone) return <p className="text-sm text-muted">Add a mobile number above to use it for sign-in codes and password recovery.</p>;
  if (verified) {
    return (
      <p className="flex items-center gap-2 text-sm text-success">
        <Check className="h-4 w-4" /> Your number is confirmed. It can receive password-recovery codes.
      </p>
    );
  }
  async function send() {
    setBusy(true);
    setMsg(null);
    const res = await callApi("/api/account/phone", "POST");
    setBusy(false);
    if (res.ok) setSent(true);
    else setMsg({ tone: "error", text: res.error?.message ?? "Could not send the text." });
  }
  async function confirm(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const res = await callApi("/api/account/phone", "PUT", { code: String(new FormData(e.currentTarget).get("code") ?? "").replace(/\s/g, "") });
    setBusy(false);
    if (res.ok) router.refresh();
    else setMsg({ tone: "error", text: res.error?.message ?? "That code did not work." });
  }
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">Your number is not confirmed yet, so it cannot be used to recover your account.</p>
      {!sent ? (
        <button type="button" onClick={() => void send()} disabled={busy} className="btn-quiet">
          {busy ? <LoaderIcon className="h-4 w-4 animate-spin" /> : null} Text me a code
        </button>
      ) : (
        <form onSubmit={confirm} className="flex max-w-sm gap-2">
          <label htmlFor="phone-code" className="sr-only">Code</label>
          <input id="phone-code" name="code" required inputMode="numeric" maxLength={9} autoComplete="one-time-code" className="input text-center tracking-[0.3em]" placeholder="000000" />
          <button type="submit" disabled={busy} className="btn-primary shrink-0">Confirm</button>
        </form>
      )}
      <Feedback m={msg} />
    </div>
  );
}

/** Switch the setup guide off (or on) for yourself. */
export function GuideSwitch({ off }: { off: boolean }) {
  const router = useRouter();
  const [value, setValue] = useState(off);
  const [busy, setBusy] = useState(false);
  async function toggle() {
    const next = !value;
    setValue(next);
    setBusy(true);
    await callApi("/api/account/guide", "PATCH", { off: next });
    setBusy(false);
    router.refresh();
  }
  return (
    <div className="card flex max-w-xl items-start justify-between gap-4 p-5">
      <div>
        <p className="font-medium" id="guide-label">Show the setup guide</p>
        <p className="text-sm text-muted">The getting-started checklist for new teams. Turn it off and it stops opening and stops showing on Home.</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={!value}
        aria-labelledby="guide-label"
        disabled={busy}
        onClick={() => void toggle()}
        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${!value ? "bg-primary" : "bg-wash/20"}`}
      >
        <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${!value ? "translate-x-5" : "translate-x-0.5"}`} />
      </button>
    </div>
  );
}
