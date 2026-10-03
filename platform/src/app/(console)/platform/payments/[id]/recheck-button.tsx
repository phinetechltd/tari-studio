"use client";

import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { callApi } from "@/components/json-form";

export function RecheckButton({ id, disabled }: { id: string; disabled: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const run = async () => {
    setBusy(true);
    setNote(null);
    const r = await callApi<{ status: string; changed: boolean; failureReason: string | null }>(`/api/platform/payments/${id}/recheck`, "POST");
    setBusy(false);
    if (!r.ok || !r.data) return setNote(r.error?.message ?? "Could not reach the provider.");
    setNote(r.data.changed ? `Updated: now ${r.data.status.toLowerCase()}.` : `No change: still ${r.data.status.toLowerCase()}.`);
    router.refresh();
  };

  return (
    <div>
      <button type="button" className="btn-quiet" disabled={busy || disabled} onClick={() => void run()}>
        <RefreshCw className={busy ? "h-4 w-4 animate-spin" : "h-4 w-4"} /> {disabled ? "Already final" : "Re-check now"}
      </button>
      {note ? <p className="mt-2 text-sm text-muted" role="status">{note}</p> : null}
    </div>
  );
}
