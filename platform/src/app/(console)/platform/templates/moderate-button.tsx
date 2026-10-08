"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { callApi } from "@/components/json-form";

/** Hides an organisation's public template from everyone else (with a reason it will see), or shows it again. */
export function ModerateButton({ id, hidden }: { id: string; hidden: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function act() {
    let reason: string | null = null;
    if (!hidden) {
      reason = window.prompt("Why is it being hidden? The organisation that made it will see this.");
      if (!reason || reason.trim().length < 3) return;
    }
    setBusy(true);
    setError(null);
    const r = await callApi(`/api/platform/templates/${id}/moderation`, "PATCH", { hidden: !hidden, reason });
    setBusy(false);
    if (!r.ok) return setError(r.error?.message ?? "Not done.");
    router.refresh();
  }

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button type="button" onClick={() => void act()} disabled={busy} className={hidden ? "btn-quiet min-h-[32px] px-3 text-xs" : "btn-ghost min-h-[32px] px-3 text-xs text-red-300"}>
        {busy ? "…" : hidden ? "Show again" : "Hide from everyone"}
      </button>
      {error ? <span className="text-[11px] text-red-300">{error}</span> : null}
    </span>
  );
}
