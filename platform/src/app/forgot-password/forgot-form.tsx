"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { PasswordField } from "@/components/auth/password-field";
import { callApi } from "@/components/json-form";

export function ForgotForm() {
  const router = useRouter();
  const [identifier, setIdentifier] = useState("");
  const [step, setStep] = useState<"ask" | "code">("ask");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function ask(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const res = await callApi("/api/auth/forgot", "POST", { identifier });
    setPending(false);
    if (res.ok) setStep("code");
    else setError(res.error?.message ?? "Could not send the code.");
  }

  async function reset(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const f = new FormData(e.currentTarget);
    const res = await callApi<{ next: string }>("/api/auth/reset", "POST", {
      identifier,
      code: String(f.get("code") ?? "").replace(/\s/g, ""),
      password: f.get("password"),
    });
    setPending(false);
    if (res.ok) {
      router.push(res.data!.next);
      router.refresh();
    } else setError(res.error?.message ?? "Could not reset the password.");
  }

  if (step === "ask") {
    return (
      <form onSubmit={ask} className="space-y-4">
        <div>
          <label htmlFor="identifier" className="label">Email or phone</label>
          <input id="identifier" required className="input" value={identifier} onChange={(e) => setIdentifier(e.target.value)} autoComplete="username" placeholder="you@example.com or 0712 345 678" />
        </div>
        {error ? <p role="alert" className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p> : null}
        <button type="submit" disabled={pending} className="btn-primary w-full">{pending ? "Sending…" : "Send me a code"}</button>
      </form>
    );
  }

  return (
    <form onSubmit={reset} className="space-y-4">
      <p role="status" className="rounded-lg border border-success/40 bg-success/10 px-3 py-2 text-sm text-success">
        If an account matches, a code is on its way. By email you also get a button that opens the reset page. The code works for 15 minutes.
      </p>
      <div>
        <label htmlFor="code" className="label">6-digit code</label>
        <input id="code" name="code" required inputMode="numeric" autoComplete="one-time-code" maxLength={9} className="input text-center text-lg tracking-[0.4em]" placeholder="000000" />
      </div>
      <PasswordField id="password" name="password" label="New password" autoComplete="new-password" showHint />
      {error ? <p role="alert" className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p> : null}
      <button type="submit" disabled={pending} className="btn-primary w-full">{pending ? "Saving…" : "Set new password"}</button>
      <button type="button" onClick={() => setStep("ask")} className="btn-ghost w-full">Use a different email or phone</button>
    </form>
  );
}
