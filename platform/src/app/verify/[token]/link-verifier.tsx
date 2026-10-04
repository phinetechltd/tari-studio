"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { callApi } from "@/components/json-form";

export function LinkVerifier({ token }: { token: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function confirm() {
    setPending(true);
    setError(null);
    const res = await callApi<{ next: string }>("/api/auth/verify", "POST", { link: token });
    setPending(false);
    if (res.ok) {
      router.push(res.data!.next);
      router.refresh();
    } else setError(res.error?.message ?? "This link has expired. Ask for a new code.");
  }
  return (
    <div className="space-y-4">
      {error ? (
        <>
          <p role="alert" className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>
          <a href="/verify" className="btn-quiet w-full">Enter a code instead</a>
        </>
      ) : null}
      <button type="button" disabled={pending} onClick={() => void confirm()} className="btn-primary w-full">
        {pending ? "Confirming…" : "Confirm my email"}
      </button>
    </div>
  );
}
