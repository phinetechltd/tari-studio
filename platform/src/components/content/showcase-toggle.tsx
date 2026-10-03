"use client";

import { Globe } from "lucide-react";
import { useState } from "react";

import { callApi } from "@/components/landing/order-events";

/** Platform admins only: show this generation on the public landing page. */
export function ShowcaseToggle({ assetId, initial, initialTitle }: { assetId: string; initial: boolean; initialTitle: string | null }) {
  const [on, setOn] = useState(initial);
  const [title, setTitle] = useState(initialTitle ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async (next: boolean) => {
    setBusy(true);
    setError(null);
    const r = await callApi<{ showcase: boolean }>(`/api/content/assets/${assetId}/showcase`, {
      method: "PUT",
      body: JSON.stringify({ showcase: next, title: title || undefined }),
    });
    setBusy(false);
    if (r.error) setError(r.error);
    else setOn(r.data!.showcase);
  };

  return (
    <div className="card space-y-3 p-5 text-sm">
      <p className="flex items-center gap-2 font-medium text-ink">
        <Globe className="h-4 w-4 text-primary" aria-hidden /> Landing page
      </p>
      <p className="text-muted">
        {on ? "Shown in “Fresh from the Studio” on the public home page." : "Pin this to the public home page. Anyone can see and download it there."}
      </p>
      <div>
        <label className="label" htmlFor="showcase-title">Caption</label>
        <input id="showcase-title" className="input" maxLength={80} placeholder="e.g. Product reveal for a perfume brand" value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>
      <div className="flex gap-2">
        <button type="button" className={on ? "btn-quiet" : "btn-primary"} disabled={busy} onClick={() => void save(!on)}>
          {on ? "Take it off" : "Show on the landing page"}
        </button>
        {on ? (
          <button type="button" className="btn-quiet" disabled={busy} onClick={() => void save(true)}>
            Save caption
          </button>
        ) : null}
      </div>
      {error ? <p className="text-danger">{error}</p> : null}
    </div>
  );
}
