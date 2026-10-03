"use client";

import { LoaderIcon, UserRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { callApi } from "@/components/landing/order-events";

/** Keeps a finished generated image as a character, to reuse in other campaigns. */
export function SaveAsCharacter({ assetId, suggestedDescription }: { assetId: string; suggestedDescription: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState(suggestedDescription.slice(0, 600));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await callApi<{ id: string }>("/api/characters/from-asset", { method: "POST", body: JSON.stringify({ assetId, name, description }) });
    setBusy(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    router.push(`/app/characters/${res.data!.id}`);
  }

  if (!open) {
    return (
      <button type="button" className="btn-quiet" onClick={() => setOpen(true)}>
        <UserRound className="h-4 w-4" /> Save as character
      </button>
    );
  }
  return (
    <form onSubmit={(e) => void save(e)} className="card absolute right-0 top-12 z-20 w-80 space-y-3 p-4 text-left shadow-2xl">
      <div>
        <label className="label" htmlFor="sc-name">Character name</label>
        <input id="sc-name" className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
      </div>
      <div>
        <label className="label" htmlFor="sc-desc">How they look</label>
        <textarea id="sc-desc" className="input min-h-[80px] py-2" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={600} />
      </div>
      {error && <p className="text-sm text-danger" role="alert">{error}</p>}
      <div className="flex gap-2">
        <button type="submit" className="btn-primary" disabled={busy || name.trim().length < 2}>
          {busy && <LoaderIcon className="h-4 w-4 animate-spin" />}
          Save
        </button>
        <button type="button" className="btn-quiet" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </form>
  );
}
