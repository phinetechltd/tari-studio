"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { PasswordField } from "@/components/auth/password-field";
import { callApi } from "@/components/json-form";

export function SignupForm() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);
    setFields({});
    const f = new FormData(e.currentTarget);
    const email = String(f.get("email") ?? "");
    const res = await callApi("/api/auth/register", "POST", {
      name: f.get("name"),
      email,
      password: f.get("password"),
      acceptTerms: f.get("acceptTerms") === "on",
      website: f.get("website") || undefined,
    });
    setPending(false);
    if (res.ok) {
      router.push(`/verify?email=${encodeURIComponent(email)}`);
      return;
    }
    const issues = (res.error?.details as { issues?: Array<{ path: string; message: string }> } | undefined)?.issues ?? [];
    setFields(Object.fromEntries(issues.map((i) => [i.path, i.message])));
    setError(res.error?.message ?? "Could not create the account.");
  }

  const fe = (k: string) => (fields[k] ? <p className="mt-1 text-xs text-danger" role="alert">{fields[k]}</p> : null);

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <div>
        <label htmlFor="name" className="label">Your name</label>
        <input id="name" name="name" required autoComplete="name" className="input" />
        {fe("name")}
      </div>
      <div>
        <label htmlFor="email" className="label">Email</label>
        <input id="email" name="email" type="email" required autoComplete="email" inputMode="email" className="input" />
        {fe("email")}
      </div>
      <div>
        <PasswordField id="password" name="password" label="Password" autoComplete="new-password" showHint />
        {fe("password")}
      </div>
      {/* Honeypot: people never see it. */}
      <div aria-hidden className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label htmlFor="website">Website</label>
        <input id="website" name="website" tabIndex={-1} autoComplete="off" />
      </div>
      <label className="flex items-start gap-3 text-sm text-muted">
        <input type="checkbox" name="acceptTerms" className="mt-1 accent-[rgb(var(--c-primary))]" />
        <span>
          I have read the{" "}
          <Link href="/privacy" target="_blank" className="text-primary hover:underline">privacy policy</Link> and{" "}
          <Link href="/cookies" target="_blank" className="text-primary hover:underline">cookie policy</Link>.
        </span>
      </label>
      {fe("acceptTerms")}
      {error && !Object.keys(fields).length ? (
        <p role="alert" className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>
      ) : null}
      <button type="submit" disabled={pending} className="btn-primary w-full">
        {pending ? "Creating…" : "Create account"}
      </button>
    </form>
  );
}
