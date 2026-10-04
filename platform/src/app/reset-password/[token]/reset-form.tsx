"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { PasswordField } from "@/components/auth/password-field";
import { callApi } from "@/components/json-form";

export function ResetForm({ token }: { token: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const res = await callApi<{ next: string }>("/api/auth/reset", "POST", { link: token, password: new FormData(e.currentTarget).get("password") });
    setPending(false);
    if (res.ok) {
      router.push(res.data!.next);
      router.refresh();
    } else setError(res.error?.message ?? "Could not reset the password.");
  }
  return (
    <form method="post" onSubmit={submit} className="space-y-4">
      <PasswordField id="password" name="password" label="New password" autoComplete="new-password" showHint />
      {error ? (
        <p role="alert" className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
          {error} <a href="/forgot-password" className="underline">Ask for a new one</a>.
        </p>
      ) : null}
      <button type="submit" disabled={pending} className="btn-primary w-full">{pending ? "Saving…" : "Set new password"}</button>
    </form>
  );
}
