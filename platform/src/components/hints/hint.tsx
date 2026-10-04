"use client";

import { Lightbulb, X } from "lucide-react";
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

import { callApi } from "@/components/json-form";

/**
 * First-use tips. Each page can show a short tip the first time someone opens
 * it; "Got it" hides that one for good, "Turn off tips" hides them all (and
 * can be undone from the profile page). The state lives on the user
 * (User.hintsEnabled, User.dismissedHints), so it follows them across devices.
 */

interface HintState {
  enabled: boolean;
  dismissed: ReadonlySet<string>;
  dismiss: (id: string) => void;
  turnOff: () => void;
}

const HintContext = createContext<HintState | null>(null);

export function HintProvider({ enabled: initialEnabled, dismissed: initialDismissed, children }: { enabled: boolean; dismissed: string[]; children: ReactNode }) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(() => new Set(initialDismissed));

  const dismiss = useCallback((id: string) => {
    setDismissed((prev) => new Set([...prev, id]));
    void callApi("/api/account/hints", "PATCH", { dismiss: id });
  }, []);
  const turnOff = useCallback(() => {
    setEnabled(false);
    void callApi("/api/account/hints", "PATCH", { enabled: false });
  }, []);

  const value = useMemo(() => ({ enabled, dismissed, dismiss, turnOff }), [enabled, dismissed, dismiss, turnOff]);
  return <HintContext.Provider value={value}>{children}</HintContext.Provider>;
}

/** A dismissible tip. Renders nothing once dismissed, when tips are off, or outside the console. */
export function Hint({ id, title, children, className }: { id: string; title: string; children: ReactNode; className?: string }) {
  const ctx = useContext(HintContext);
  if (!ctx || !ctx.enabled || ctx.dismissed.has(id)) return null;
  return (
    <aside
      aria-label={`Tip: ${title}`}
      data-hint={id}
      className={`relative mb-6 flex gap-3 rounded-2xl border border-primary/30 bg-primary/[0.08] p-4 pr-10 text-sm ${className ?? ""}`}
    >
      <Lightbulb className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden />
      <div className="min-w-0">
        <p className="font-semibold text-ink">{title}</p>
        <div className="mt-1 text-ink/75">{children}</div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" onClick={() => ctx.dismiss(id)} className="btn-primary min-h-[34px] px-3 text-xs">
            Got it
          </button>
          <button type="button" onClick={ctx.turnOff} className="min-h-[34px] rounded-full px-3 text-xs text-ink/70 hover:bg-wash/[0.06] hover:text-ink">
            Turn off tips
          </button>
        </div>
      </div>
      <button
        type="button"
        onClick={() => ctx.dismiss(id)}
        aria-label="Dismiss tip"
        className="absolute right-2 top-2 inline-flex h-8 w-8 items-center justify-center rounded-full text-ink/60 hover:bg-wash/[0.06] hover:text-ink"
      >
        <X className="h-4 w-4" />
      </button>
    </aside>
  );
}
