"use client";

import { LoaderIcon, Plus, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { callApi } from "@/components/landing/order-events";

interface Pick {
  id: string;
  name: string;
  cover: string | null;
}

/** The characters taking part in a campaign: add from the agency's own, or take one out. */
export function CampaignCharacters({
  campaignId,
  attached,
  available,
  canWrite,
}: {
  campaignId: string;
  attached: Pick[];
  available: Pick[];
  canWrite: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const attachedIds = new Set(attached.map((a) => a.id));
  const choices = available.filter((c) => !attachedIds.has(c.id));

  async function set(characterId: string, isAttached: boolean) {
    setBusy(characterId);
    setError(null);
    const res = await callApi(`/api/campaigns/${campaignId}/characters`, { method: "POST", body: JSON.stringify({ characterId, attached: isAttached }) });
    setBusy(null);
    if (res.error) setError(res.error);
    else router.refresh();
  }

  return (
    <div>
      {attached.length === 0 ? (
        <p className="text-sm text-muted">No characters yet. Add the faces of this campaign and pick them in the Studio to keep them consistent.</p>
      ) : (
        <ul className="flex flex-wrap gap-3">
          {attached.map((c) => (
            <li key={c.id} className="flex items-center gap-2 rounded-full border border-line bg-raised py-1 pl-1 pr-3 text-sm">
              {c.cover ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={c.cover} alt="" className="h-8 w-8 rounded-full object-cover" />
              ) : (
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary">{c.name.slice(0, 1)}</span>
              )}
              <Link href={`/app/characters/${c.id}`} className="font-medium text-ink hover:underline">
                {c.name}
              </Link>
              {canWrite && (
                <button type="button" className="text-muted hover:text-danger" aria-label={`Remove ${c.name} from this campaign`} disabled={busy !== null} onClick={() => void set(c.id, false)}>
                  {busy === c.id ? <LoaderIcon className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {canWrite && (
        <div className="mt-4">
          {choices.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted">Add:</span>
              {choices.map((c) => (
                <button key={c.id} type="button" className="btn-quiet min-h-[32px] px-3 text-xs" disabled={busy !== null} onClick={() => void set(c.id, true)}>
                  {busy === c.id ? <LoaderIcon className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                  {c.name}
                </button>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted">
              {available.length === 0 ? (
                <>
                  You have no characters yet.{" "}
                  <Link href="/app/characters/new" className="text-primary hover:underline">
                    Create one
                  </Link>
                  .
                </>
              ) : (
                "Every character you have is already in this campaign."
              )}
            </p>
          )}
        </div>
      )}
      {error && <p className="mt-3 text-sm text-danger" role="alert">{error}</p>}
    </div>
  );
}
