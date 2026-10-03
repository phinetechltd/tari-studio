"use client";

import { LayoutTemplate, Megaphone, UserRound } from "lucide-react";

export interface StudioContext {
  templateId: string | null;
  characterIds: string[];
  campaignId: string | null;
}

export interface ContextOptions {
  templates: Array<{ id: string; title: string }>;
  characters: Array<{ id: string; name: string; cover: string | null }>;
  campaigns: Array<{ id: string; name: string }>;
}

const MAX_CHARACTERS = 3;

/**
 * Chooses what shapes the next prompt: a template (its text goes in front),
 * up to three characters (their descriptions are added), and the campaign the
 * result is for. Sent with each message; empty means a plain prompt.
 */
export function ContextBar({
  options,
  value,
  onChange,
  disabled,
}: {
  options: ContextOptions;
  value: StudioContext;
  onChange: (v: StudioContext) => void;
  disabled?: boolean;
}) {
  if (options.templates.length === 0 && options.characters.length === 0 && options.campaigns.length === 0) return null;
  const toggle = (id: string) => {
    const has = value.characterIds.includes(id);
    if (!has && value.characterIds.length >= MAX_CHARACTERS) return;
    onChange({ ...value, characterIds: has ? value.characterIds.filter((c) => c !== id) : [...value.characterIds, id] });
  };

  return (
    <div className="card space-y-3 p-3 text-sm" aria-label="Shape the prompt">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {options.templates.length > 0 && (
          <label className="flex items-center gap-2">
            <LayoutTemplate className="h-4 w-4 text-primary" aria-hidden />
            <span className="sr-only">Template</span>
            <select className="input min-h-[36px] w-auto py-1" disabled={disabled} value={value.templateId ?? ""} onChange={(e) => onChange({ ...value, templateId: e.target.value || null })}>
              <option value="">No template</option>
              {options.templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </select>
          </label>
        )}
        {options.campaigns.length > 0 && (
          <label className="flex items-center gap-2">
            <Megaphone className="h-4 w-4 text-primary" aria-hidden />
            <span className="sr-only">Campaign</span>
            <select className="input min-h-[36px] w-auto py-1" disabled={disabled} value={value.campaignId ?? ""} onChange={(e) => onChange({ ...value, campaignId: e.target.value || null })}>
              <option value="">No campaign</option>
              {options.campaigns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      {options.characters.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <UserRound className="h-4 w-4 text-primary" aria-hidden />
          <span className="text-xs text-muted">Characters (up to {MAX_CHARACTERS}):</span>
          {options.characters.map((c) => {
            const on = value.characterIds.includes(c.id);
            return (
              <button
                key={c.id}
                type="button"
                aria-pressed={on}
                disabled={disabled || (!on && value.characterIds.length >= MAX_CHARACTERS)}
                onClick={() => toggle(c.id)}
                className={`flex min-h-[32px] items-center gap-2 rounded-full border py-0.5 pl-0.5 pr-3 text-xs transition-colors disabled:opacity-40 ${on ? "border-primary bg-primary/15 text-ink" : "border-line text-muted hover:text-ink"}`}
              >
                {c.cover ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={c.cover} alt="" className="h-6 w-6 rounded-full object-cover" />
                ) : (
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/20 text-[10px] font-semibold text-primary">{c.name.slice(0, 1)}</span>
                )}
                {c.name}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
