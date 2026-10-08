"use client";

import { Building2, LayoutTemplate, Megaphone, Package, UserRound } from "lucide-react";
import { useState } from "react";

import { pickStart, sameRef, startCandidates, type ContextSources, type StartImageRef, type StudioContext } from "@/lib/studio-context";

import { PinterestTemplateButton } from "./pinterest-template-button";

export type { StudioContext } from "@/lib/studio-context";

export interface ContextOptions extends ContextSources {
  campaigns: Array<{ id: string; name: string }>;
  /** May make templates (shows "From Pinterest") */
  allowPinterest?: boolean;
}

const MAX_CHARACTERS = 3;

/**
 * Chooses what shapes the next prompt. Any or all of: a brand (its name, slogan and voice), a product
 * (its name, description and details), up to three characters, a template, and the campaign the
 * result is for. Their words go into the prompt. For a video, one of their pictures can be the
 * first frame; images are made from words only. Empty means a plain prompt.
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
  // Templates made from Pinterest in this visit, until the page reloads with them in `options`.
  const [added, setAdded] = useState<Array<{ id: string; title: string }>>([]);
  const templates = [...options.templates, ...added.filter((a) => !options.templates.some((t) => t.id === a.id))];
  const empty = templates.length + options.characters.length + options.campaigns.length + options.brands.length + options.products.length === 0;
  if (empty && !options.allowPinterest) return null;

  const candidates = startCandidates(options, value);
  const picked = pickStart(candidates, value.startImage);
  const products = value.brandId ? options.products.filter((p) => p.brandId === value.brandId) : options.products;

  const toggle = (id: string) => {
    const has = value.characterIds.includes(id);
    if (!has && value.characterIds.length >= MAX_CHARACTERS) return;
    onChange({ ...value, characterIds: has ? value.characterIds.filter((c) => c !== id) : [...value.characterIds, id] });
  };
  const choosePicture = (ref: StartImageRef | null) => onChange({ ...value, startImage: ref });

  const select = (icon: React.ReactNode, label: string, current: string, none: string, items: Array<{ id: string; name: string }>, set: (id: string | null) => void) => (
    <label className="flex items-center gap-2">
      {icon}
      <span className="sr-only">{label}</span>
      <select className="input min-h-[36px] w-auto max-w-[14rem] py-1" disabled={disabled} value={current} onChange={(e) => set(e.target.value || null)}>
        <option value="">{none}</option>
        {items.map((i) => (
          <option key={i.id} value={i.id}>{i.name}</option>
        ))}
      </select>
    </label>
  );
  const ic = "h-4 w-4 text-primary";

  return (
    <div className="card space-y-3 p-3 text-sm" aria-label="Shape the prompt">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {options.brands.length > 0 &&
          select(<Building2 className={ic} aria-hidden />, "Brand", value.brandId ?? "", "No brand", options.brands, (id) =>
            onChange({ ...value, brandId: id, productId: id && value.productId && options.products.find((p) => p.id === value.productId)?.brandId !== id ? null : value.productId }),
          )}
        {options.products.length > 0 &&
          select(<Package className={ic} aria-hidden />, "Product", value.productId ?? "", "No product", products, (id) => {
            const p = id ? options.products.find((x) => x.id === id) : null;
            onChange({ ...value, productId: id, brandId: p ? p.brandId : value.brandId });
          })}
        {templates.length > 0 &&
          select(<LayoutTemplate className={ic} aria-hidden />, "Template", value.templateId ?? "", "No template", templates.map((t) => ({ id: t.id, name: t.title })), (id) => onChange({ ...value, templateId: id }))}
        {options.allowPinterest ? (
          <PinterestTemplateButton
            disabled={disabled}
            onCreated={(t) => {
              setAdded((list) => [...list, { id: t.id, title: t.title }]);
              onChange({ ...value, templateId: t.id });
            }}
          />
        ) : null}
        {options.campaigns.length > 0 && select(<Megaphone className={ic} aria-hidden />, "Campaign", value.campaignId ?? "", "No campaign", options.campaigns, (id) => onChange({ ...value, campaignId: id }))}
      </div>

      {options.characters.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <UserRound className={ic} aria-hidden />
          <span className="text-xs text-muted">Characters (up to {MAX_CHARACTERS}):</span>
          {options.characters.map((c) => {
            const on = value.characterIds.includes(c.id);
            const cover = c.images[0]?.url ?? null;
            return (
              <button
                key={c.id}
                type="button"
                aria-pressed={on}
                disabled={disabled || (!on && value.characterIds.length >= MAX_CHARACTERS)}
                onClick={() => toggle(c.id)}
                className={`flex min-h-[32px] items-center gap-2 rounded-full border py-0.5 pl-0.5 pr-3 text-xs transition-colors disabled:opacity-40 ${on ? "border-primary bg-primary/15 text-ink" : "border-line text-muted hover:text-ink"}`}
              >
                {cover ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={cover} alt="" className="h-6 w-6 rounded-full object-cover" />
                ) : (
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/20 text-[10px] font-semibold text-primary">{c.name.slice(0, 1)}</span>
                )}
                {c.name}
              </button>
            );
          })}
        </div>
      )}

      {candidates.length > 0 && (
        <div className="border-t border-line pt-3">
          <p className="mb-2 text-xs text-muted">
            A video can start from one of these pictures{picked ? ` (using “${picked.label}”)` : " (words only)"}. Images are made from words.
          </p>
          <ul className="flex flex-wrap items-center gap-2">
            {candidates.map((c) => {
              const on = picked ? sameRef(picked, c) : false;
              return (
                <li key={`${c.source}-${c.id}`}>
                  <button
                    type="button"
                    aria-pressed={on}
                    aria-label={`Start from ${c.label}`}
                    title={c.label}
                    disabled={disabled}
                    onClick={() => choosePicture({ source: c.source, id: c.id })}
                    className={`overflow-hidden rounded-lg border-2 transition-colors ${on ? "border-primary" : "border-transparent opacity-70 hover:opacity-100"}`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={c.thumb} alt="" className="h-12 w-12 object-cover" loading="lazy" />
                  </button>
                </li>
              );
            })}
            <li>
              <button
                type="button"
                aria-pressed={picked === null}
                disabled={disabled}
                onClick={() => choosePicture(null)}
                className={`min-h-[32px] rounded-full border px-3 text-xs ${picked === null ? "border-primary bg-primary/15 text-ink" : "border-line text-muted hover:text-ink"}`}
              >
                Words only
              </button>
            </li>
          </ul>
        </div>
      )}
    </div>
  );
}
