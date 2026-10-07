"use client";

import { Sparkles, X } from "lucide-react";
import { useCallback, useRef, useState } from "react";

import { callApi } from "@/components/json-form";

/**
 * The one AI autofill widget every upload-and-fill form shares: a picture goes
 * up (an upload or a media-library asset), the platform AI drafts the empty
 * fields, and the person applies what they like as editable, regeneratable
 * text. The person's own words are never overwritten — the caller decides when
 * to run it, and only empty fields come back.
 *
 * Failures are quiet: `aiOk: false` simply shows nothing and the form keeps
 * working normally.
 */

export interface AutofillState {
  suggestions: Record<string, string>;
  busy: boolean;
  /** Set when the run produced nothing (rate limit, unreadable image, AI down). */
  quietReason: string | null;
}

export function useImageAutofill(props: {
  formKind: "template" | "post" | "product" | "character" | "campaign";
  /** The form's current values; only empty ones receive suggestions. */
  getFields: () => Record<string, string>;
  /** Returns the picked upload file, when the form has one. */
  getFile?: () => File | null;
  /** Returns a media-library asset id, when the form works from the library. */
  getAssetId?: () => string | null;
  brandId?: () => string | null;
  /** Extra context (template category, campaign name) the copy should match. */
  getContext?: () => string | null;
  /** Applies a suggestion to one field, as editable text. */
  onApply: (field: string, value: string) => void;
}) {
  const [state, setState] = useState<AutofillState>({ suggestions: {}, busy: false, quietReason: null });
  const ranOnce = useRef(false);
  const stateRef = useRef(state);
  stateRef.current = state;

  const run = useCallback(async () => {
    const fields = props.getFields();
    const file = props.getFile?.() ?? null;
    const assetId = props.getAssetId?.() ?? null;
    if (file === null && !assetId) return;
    setState((s) => ({ ...s, busy: true, quietReason: null }));
    let res;
    if (file) {
      const form = new FormData();
      form.append("file", file);
      form.set("formKind", props.formKind);
      form.set("fields", JSON.stringify(fields));
      const brand = props.brandId?.() ?? null;
      if (brand) form.set("brandId", brand);
      const ctx = props.getContext?.() ?? null;
      if (ctx) form.set("context", ctx.slice(0, 400));
      try {
        const r = await fetch("/api/ai/autofill", { method: "POST", body: form, credentials: "same-origin" });
        const json = (await r.json().catch(() => null)) as { ok: boolean; data?: { aiOk: boolean; suggestions: Record<string, string>; reason?: string } } | null;
        res = json && typeof json.ok === "boolean" ? json : null;
      } catch {
        res = null;
      }
    } else {
      res = await callApi<{ aiOk: boolean; suggestions: Record<string, string>; reason?: string }>("/api/ai/autofill", "POST", {
        formKind: props.formKind,
        fields,
        assetId,
        brandId: props.brandId?.() ?? null,
        context: props.getContext?.() ?? undefined,
      });
    }
    const data = res?.ok && res.data ? res.data : null;
    setState({
      suggestions: data?.aiOk ? (data.suggestions ?? {}) : {},
      busy: false,
      quietReason: data?.aiOk ? null : (data?.reason ?? null),
    });
  }, [props]);

  /** Runs once per new image, when the relevant fields are still empty. */
  const runOnceForNewImage = useCallback(() => {
    if (ranOnce.current) return;
    ranOnce.current = true;
    void run();
  }, [run]);

  const reset = useCallback(() => {
    ranOnce.current = false;
    setState({ suggestions: {}, busy: false, quietReason: null });
  }, []);

  const apply = useCallback(
    (field: string) => {
      const value = stateRef.current.suggestions[field];
      if (!value) return;
      props.onApply(field, value);
      setState((s) => {
        const rest = { ...s.suggestions };
        delete rest[field];
        return { ...s, suggestions: rest };
      });
    },
    [props],
  );

  const applyAll = useCallback(() => {
    const suggestions = stateRef.current.suggestions;
    for (const [field, value] of Object.entries(suggestions)) props.onApply(field, value);
    setState((s) => ({ ...s, suggestions: {} }));
  }, [props]);

  return { ...state, run, runOnceForNewImage, reset, apply, applyAll };
}

const FIELD_LABELS: Record<string, string> = {
  title: "Title",
  name: "Name",
  description: "Description",
  caption: "Caption",
  hashtags: "Hashtags",
  keywords: "Keywords",
  promptHint: "Prompt hint",
};

/** The suggestion chips under a form: apply per field, all at once, or dismiss. */
export function AiSuggestionBar(props: {
  suggestions: Record<string, string>;
  busy: boolean;
  quietReason: string | null;
  onApply: (field: string) => void;
  onApplyAll: () => void;
  onRegenerate: () => void;
  onDismiss: () => void;
  label?: string;
}) {
  const entries = Object.entries(props.suggestions);
  if (props.busy) {
    return (
      <p className="flex items-center gap-2 rounded-lg border border-wash/[0.08] bg-wash/[0.04] px-3 py-2 text-sm text-muted" role="status">
        <Sparkles className="h-4 w-4 animate-spin" /> Tari AI is looking at the image…
      </p>
    );
  }
  if (entries.length === 0) return null;
  return (
    <div className="rounded-lg border border-wash/[0.08] bg-wash/[0.04] p-3" role="status">
      <p className="flex items-center gap-1.5 text-xs font-medium text-muted">
        <Sparkles className="h-3.5 w-3.5" /> {props.label ?? "Drafted by Tari AI — check and edit before you keep it"}
      </p>
      <ul className="mt-2 space-y-1.5">
        {entries.map(([field, value]) => (
          <li key={field} className="flex items-start justify-between gap-3 text-sm">
            <span className="min-w-0">
              <span className="font-medium text-ink">{FIELD_LABELS[field] ?? field}: </span>
              <span className="text-ink/80">{value}</span>
            </span>
            <button type="button" onClick={() => props.onApply(field)} className="btn-quiet shrink-0 px-2 py-1 text-xs">
              Use
            </button>
          </li>
        ))}
      </ul>
      <div className="mt-2 flex flex-wrap gap-2">
        <button type="button" onClick={props.onApplyAll} className="btn-quiet px-2.5 py-1 text-xs">
          Use all
        </button>
        <button type="button" onClick={props.onRegenerate} className="btn-quiet px-2.5 py-1 text-xs">
          Regenerate
        </button>
        <button type="button" onClick={props.onDismiss} aria-label="Dismiss suggestions" className="btn-quiet px-2 py-1 text-xs">
          <X className="h-3.5 w-3.5" /> Dismiss
        </button>
      </div>
    </div>
  );
}
