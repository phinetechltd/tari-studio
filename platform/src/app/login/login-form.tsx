"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { PasswordField } from "@/components/auth/password-field";
import { callApi } from "@/components/json-form";
import { safeNext } from "@/lib/safe-next";

/** Password sign-in, with a second tab to sign in using a code sent by email or SMS instead. */
export function LoginForm({ next }: { next?: string | null }) {
  const router = useRouter();
  const [mode, setMode] = useState<"password" | "code">("password");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showTotp, setShowTotp] = useState(false);
  const [codeSent, setCodeSent] = useState(false);
  const [identifier, setIdentifier] = useState("");
  const [email, setEmail] = useState("");

  function arrive(dest: string) {
    // The server may send the person somewhere first (the welcome screen); otherwise honour ?next.
    const back = safeNext(next);
    router.push(back && dest === "/app" ? back : dest);
    router.refresh();
  }

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const v = Object.fromEntries(new FormData(e.currentTarget).entries()) as Record<string, string>;
    const body: Record<string, string> = { email: v.email, password: v.password };
    if (v.totp) body.totp = v.totp;
    const res = await callApi<{ next: string }>("/api/auth/login", "POST", body);
    setPending(false);
    if (res.ok) return arrive(res.data!.next);
    if (res.error?.code === "TOTP_REQUIRED") return setShowTotp(true);
    if (res.error?.code === "EMAIL_UNVERIFIED") return router.push(`/verify?email=${encodeURIComponent(v.email ?? "")}`);
    setError(res.error?.message ?? "Could not sign in.");
  }

  async function sendCode(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const res = await callApi("/api/auth/code", "POST", { identifier });
    setPending(false);
    if (res.ok) setCodeSent(true);
    else setError(res.error?.message ?? "Could not send a code.");
  }

  async function useCode(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const code = String(new FormData(e.currentTarget).get("code") ?? "").replace(/\s/g, "");
    const res = await callApi<{ next: string }>("/api/auth/code", "PUT", { identifier, code });
    setPending(false);
    if (res.ok) return arrive(res.data!.next);
    setError(res.error?.message ?? "That code did not work.");
  }

  const tab = (m: "password" | "code", label: string) => (
    <button
      type="button"
      role="tab"
      aria-selected={mode === m}
      onClick={() => {
        setMode(m);
        setError(null);
      }}
      className={`min-h-[40px] flex-1 rounded-lg px-3 text-sm font-medium transition-colors ${mode === m ? "bg-raised text-ink shadow-sm" : "text-muted hover:text-ink"}`}
    >
      {label}
    </button>
  );

  const errorBox = error ? (
    <p role="alert" className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
      {error}
    </p>
  ) : null;

  return (
    <div className="space-y-4">
      <div role="tablist" aria-label="How to sign in" className="flex gap-1 rounded-xl bg-surface p-1">
        {tab("password", "Password")}
        {tab("code", "Email or SMS code")}
      </div>

      {mode === "password" ? (
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label htmlFor="email" className="label">Email</label>
            <input id="email" name="email" type="email" required autoComplete="username" inputMode="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <PasswordField id="password" name="password" label="Password" autoComplete="current-password" />
          {showTotp ? (
            <div>
              <label htmlFor="totp" className="label">Two-factor code</label>
              <input id="totp" name="totp" type="text" inputMode="numeric" maxLength={6} required autoComplete="one-time-code" className="input" placeholder="123 456" />
            </div>
          ) : null}
          <div className="text-right text-sm">
            <Link href="/forgot-password" className="text-primary hover:underline">Forgot your password?</Link>
          </div>
          {errorBox}
          <button type="submit" disabled={pending} className="btn-primary w-full">{pending ? "Signing in…" : "Sign in"}</button>
        </form>
      ) : !codeSent ? (
        <form onSubmit={sendCode} className="space-y-4">
          <div>
            <label htmlFor="identifier" className="label">Email or confirmed phone</label>
            <input id="identifier" required className="input" value={identifier} onChange={(e) => setIdentifier(e.target.value)} autoComplete="username" placeholder="you@example.com or 0712 345 678" />
          </div>
          {errorBox}
          <button type="submit" disabled={pending} className="btn-primary w-full">{pending ? "Sending…" : "Send me a code"}</button>
        </form>
      ) : (
        <form onSubmit={useCode} className="space-y-4">
          <p role="status" className="rounded-lg border border-success/40 bg-success/10 px-3 py-2 text-sm text-success">
            If an account matches, a 6-digit code is on its way. It works for 15 minutes. If you use an authenticator app, sign in with your password instead.
          </p>
          <div>
            <label htmlFor="code" className="label">6-digit code</label>
            <input id="code" name="code" required inputMode="numeric" autoComplete="one-time-code" maxLength={9} className="input text-center text-lg tracking-[0.4em]" placeholder="000000" />
          </div>
          {errorBox}
          <button type="submit" disabled={pending} className="btn-primary w-full">{pending ? "Checking…" : "Sign in"}</button>
          <button type="button" className="btn-ghost w-full" onClick={() => setCodeSent(false)}>Send to a different email or phone</button>
        </form>
      )}
    </div>
  );
}
