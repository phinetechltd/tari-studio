"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { callApi } from "@/components/json-form";

/**
 * The second half of "Sign up with TikTok": TikTok proved the identity (never an email),
 * so here the person picks a real email and password; the usual emailed code then confirms it.
 */
export function TiktokCompleteForm({ defaultName }: { defaultName: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const v = Object.fromEntries(new FormData(e.currentTarget).entries()) as Record<string, string>;
    const res = await callApi<{ next: string }>("/api/auth/tiktok/complete", "POST", { email: v.email, password: v.password, name: v.name });
    setPending(false);
    if (res.ok && res.data) return router.push(res.data.next);
    setError(res.error?.message ?? "Something went wrong.");
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <p className="rounded-lg border border-line bg-raised px-3 py-2 text-sm text-muted">
        TikTok confirmed your identity. One last step: your email and a password for this account.
      </p>
      <div>
        <label htmlFor="tt-name" className="label">Your name</label>
        <input id="tt-name" name="name" defaultValue={defaultName} minLength={2} maxLength={120} className="input" autoComplete="name" />
      </div>
      <div>
        <label htmlFor="tt-email" className="label">Email</label>
        <input id="tt-email" name="email" type="email" required maxLength={254} className="input" autoComplete="email" />
        <p className="mt-1 text-xs text-muted">We send a 6-digit code here to confirm it is yours.</p>
      </div>
      <div>
        <label htmlFor="tt-password" className="label">Choose a password</label>
        <input id="tt-password" name="password" type="password" required minLength={10} maxLength={200} className="input" autoComplete="new-password" />
      </div>
      {error ? (
        <p role="alert" className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      ) : null}
      <button type="submit" disabled={pending} className="btn-primary w-full">
        {pending ? "Working…" : "Create my account"}
      </button>
    </form>
  );
}
