"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { callApi } from "@/components/json-form";

export function VerifyForm({ initialEmail }: { initialEmail: string }) {
  const router = useRouter();
  const [email, setEmail] = useState(initialEmail);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const code = String(new FormData(e.currentTarget).get("code") ?? "").replace(/\s/g, "");
    const res = await callApi<{ next: string }>("/api/auth/verify", "POST", { email, code });
    setPending(false);
    if (res.ok) {
      router.push(res.data!.next);
      router.refresh();
      return;
    }
    setError(res.error?.message ?? "That code did not work.");
  }

  async function resend() {
    setNote(null);
    setError(null);
    const res = await callApi("/api/auth/resend", "POST", { email });
    if (res.ok) setNote("If that address needs confirming, a new code is on its way.");
    else setError(res.error?.message ?? "Could not send a new code.");
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label htmlFor="email" className="label">Email</label>
        <input id="email" type="email" required className="input" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
      </div>
      <div>
        <label htmlFor="code" className="label">6-digit code</label>
        <input id="code" name="code" required inputMode="numeric" autoComplete="one-time-code" maxLength={9} className="input text-center text-lg tracking-[0.4em]" placeholder="000000" />
      </div>
      {error ? <p role="alert" className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p> : null}
      {note ? <p role="status" className="rounded-lg border border-success/40 bg-success/10 px-3 py-2 text-sm text-success">{note}</p> : null}
      <button type="submit" disabled={pending} className="btn-primary w-full">
        {pending ? "Checking…" : "Confirm email"}
      </button>
      <button type="button" onClick={() => void resend()} className="btn-ghost w-full">
        Send a new code
      </button>
    </form>
  );
}
