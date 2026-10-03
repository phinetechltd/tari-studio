"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { callApi } from "@/components/json-form";
import { safeNext } from "@/lib/safe-next";

export function LoginForm({ next }: { next?: string | null }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showTotp, setShowTotp] = useState(false);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const v = Object.fromEntries(new FormData(e.currentTarget).entries()) as Record<string, string>;

    const body: Record<string, string> = {
      email: v.email,
      password: v.password,
    };
    if (v.totp) body.totp = v.totp;

    const res = await callApi<{ next: string }>("/api/auth/login", "POST", body);
    setPending(false);

    if (res.ok) {
      // The server may send the user elsewhere first (two-factor enrolment); otherwise honour ?next.
      const back = safeNext(next);
      const usual = res.data!.next === "/app" || res.data!.next === "/platform";
      router.push(back && usual ? back : res.data!.next);
      router.refresh();
      return;
    }
    if (res.error?.code === "TOTP_REQUIRED") {
      setShowTotp(true);
      return;
    }
    setError(res.error?.message ?? "Could not sign in.");
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label htmlFor="email" className="label">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="username"
          inputMode="email"
          className="input"
        />
      </div>
      <div>
        <label htmlFor="password" className="label">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
          className="input"
        />
      </div>

      {showTotp ? (
        <div>
          <label htmlFor="totp" className="label">
            Two-factor code
          </label>
          <input
            id="totp"
            name="totp"
            type="text"
            inputMode="numeric"
            maxLength={6}
            required
            autoComplete="one-time-code"
            className="input"
            placeholder="123 456"
          />
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      ) : null}

      <button type="submit" disabled={pending} className="btn-primary w-full">
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
