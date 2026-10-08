"use client";

import { X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { callApi } from "@/components/json-form";
import { PinterestPicker, type PinChoice } from "@/components/pinterest/pinterest-picker";

export interface CreatedTemplate {
  id: string;
  title: string;
  coverId: string | null;
  coverUrl: string | null;
}

/**
 * The Studio's "From Pinterest": pick pins, and a private template made from
 * them becomes the prompt's template straight away.
 */
export function PinterestTemplateButton({ onCreated, disabled }: { onCreated: (t: CreatedTemplate) => void; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  async function create(pins: PinChoice[]): Promise<string | null> {
    const r = await callApi<CreatedTemplate>("/api/studio/pinterest-template", "POST", { pins });
    if (!r.ok || !r.data) return r.error?.message ?? "The template could not be made.";
    onCreated(r.data);
    setOpen(false);
    return null;
  }

  return (
    <>
      <button type="button" disabled={disabled} onClick={() => setOpen(true)} className="min-h-[34px] rounded-full border border-line px-3 text-xs text-muted hover:border-primary/50 hover:text-ink">
        <span className="mr-1 font-bold text-[#E60023]" aria-hidden>
          P
        </span>
        From Pinterest
      </button>
      <dialog
        ref={dialog}
        onClose={() => setOpen(false)}
        className="w-[min(960px,calc(100vw-2rem))] rounded-2xl border border-line bg-bg p-0 text-ink backdrop:bg-black/60"
        aria-labelledby="pinterest-dialog-title"
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-3">
          <h2 id="pinterest-dialog-title" className="font-semibold">
            Use Pinterest pins as the template
          </h2>
          <button type="button" onClick={() => setOpen(false)} className="rounded-full p-2 text-muted hover:bg-white/[0.06] hover:text-ink" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="max-h-[75vh] overflow-y-auto p-5">
          <p className="mb-4 text-sm text-muted">The pins become a private template for your team, with a credit link to each pin. Its words shape the prompt; other people&apos;s pictures are never used as a video&apos;s first frame.</p>
          {open ? <PinterestPicker onImport={create} importLabel="Use as template" back="/content" /> : null}
        </div>
      </dialog>
    </>
  );
}
