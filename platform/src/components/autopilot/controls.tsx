"use client";

import { LoaderIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { callApi } from "@/components/landing/order-events";

/** Switch on or off, change how it goes out, make one now to preview, or delete. */
export function AutopilotControls({ id, enabled, mode, pausedReason, canEdit }: { id: string; enabled: boolean; mode: string; pausedReason: string | null; canEdit: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function call(key: string, path: string, init: { method: string; body?: string }, after?: () => void) {
    setBusy(key);
    setError(null);
    setNotice(null);
    const res = await callApi<unknown>(path, init);
    setBusy(null);
    if (res.error) return setError(res.error);
    after?.();
    router.refresh();
  }

  if (!canEdit) return null;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={enabled ? "btn-quiet" : "btn-primary"} disabled={busy !== null} onClick={() => void call("toggle", `/api/autopilots/${id}`, { method: "PATCH", body: JSON.stringify({ enabled: !enabled }) })}>
          {busy === "toggle" && <LoaderIcon className="h-4 w-4 animate-spin" />} {enabled ? "Switch off" : "Switch on"}
        </button>
        <button type="button" className="btn-quiet" disabled={busy !== null} onClick={() => void call("run", `/api/autopilots/${id}/run`, { method: "POST", body: JSON.stringify({}) }, () => setNotice("Making one now. It will appear below in a minute or two, waiting for your approval."))}>
          {busy === "run" && <LoaderIcon className="h-4 w-4 animate-spin" />} Make one now
        </button>
        <label className="flex items-center gap-2 text-sm text-muted">
          <span>When ready</span>
          <select className="input min-h-[40px] w-auto py-1" value={mode} disabled={busy !== null} onChange={(e) => void call("mode", `/api/autopilots/${id}`, { method: "PATCH", body: JSON.stringify({ mode: e.target.value }) })}>
            <option value="APPROVE_FIRST">Ask me first</option>
            <option value="AUTO_POST">Post automatically</option>
          </select>
        </label>
        <button
          type="button"
          className="btn-quiet ml-auto text-danger"
          disabled={busy !== null}
          onClick={() => {
            if (window.confirm("Delete this Autopilot and its history? Posts already sent stay on your accounts.")) void call("delete", `/api/autopilots/${id}`, { method: "DELETE" }, () => router.push("/app/autopilot"));
          }}
        >
          Delete
        </button>
      </div>
      {!enabled && pausedReason && <p className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning" role="status">{pausedReason}</p>}
      {notice && <p className="rounded-lg border border-success/40 bg-success/10 px-3 py-2 text-sm text-success" role="status">{notice}</p>}
      {error && <p className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger" role="alert">{error}</p>}
    </div>
  );
}