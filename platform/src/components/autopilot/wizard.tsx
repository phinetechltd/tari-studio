"use client";

import { Check, LoaderIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { callApi } from "@/components/landing/order-events";
import { ASPECT_RATIOS } from "@/lib/generation-models";
import { creditsToCents, videoCreditsFor, type Pricing } from "@/lib/pricing";
import { formatKES } from "@/lib/money";
import { describeSchedule, MAX_TIMES_PER_DAY, upcoming, WEEKDAYS, type Schedule } from "@/lib/schedule";

export interface WizardOptions {
  brands: Array<{ id: string; name: string; timezone: string }>;
  products: Array<{ id: string; brandId: string; name: string; cover: string | null; outOfStock: boolean }>;
  characters: Array<{ id: string; name: string; cover: string | null }>;
  templates: Array<{ id: string; title: string }>;
  channels: Array<{ id: string; brandId: string; name: string; platform: string }>;
}

export interface WizardStart {
  name: string;
  brandId: string;
  contentKind: "IMAGE" | "VIDEO";
  seconds: number;
  aspectRatio: string;
  productIds: string[];
  characterIds: string[];
  templateId: string | null;
  guidance: string;
}

const STEPS = ["What to make", "When", "How it goes out", "Review"] as const;
const pill = (on: boolean) => `min-h-[40px] rounded-full border px-4 text-sm transition-colors ${on ? "border-primary bg-primary/15 text-ink" : "border-line text-muted hover:text-ink"}`;
const when = new Intl.DateTimeFormat("en-KE", { weekday: "long", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Nairobi" });

/**
 * Four plain steps: what to make, when, how it goes out (ask me first, or post by itself), and a review
 * with the price per post. Nothing is switched on until the last button.
 */
export function AutopilotWizard({ options, pricing, start }: { options: WizardOptions; pricing: Pricing; start: WizardStart }) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [v, setV] = useState(start);
  const [schedule, setSchedule] = useState<Schedule>({ days: [1, 4], times: ["09:00"] });
  const [mode, setMode] = useState<"APPROVE_FIRST" | "AUTO_POST">("APPROVE_FIRST");
  const [channelIds, setChannelIds] = useState<string[]>([]);
  const [cap, setCap] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const brand = options.brands.find((b) => b.id === v.brandId);
  const products = options.products.filter((p) => p.brandId === v.brandId);
  const channels = options.channels.filter((c) => c.brandId === v.brandId);
  const tz = brand?.timezone ?? "Africa/Nairobi";
  const next = useMemo(() => upcoming(schedule, tz, new Date(), 3), [schedule, tz]);
  const perPost = v.contentKind === "IMAGE" ? pricing.imageCredits : videoCreditsFor(pricing, v.seconds);
  const monthly = perPost * Math.round((schedule.days.length * schedule.times.length * 52) / 12);

  const toggle = <T,>(list: T[], item: T, max = 99): T[] => (list.includes(item) ? list.filter((x) => x !== item) : list.length < max ? [...list, item] : list);
  const needsChannel = channelIds.length === 0;

  function problemFor(s: number): string | null {
    if (s === 0 && v.name.trim().length < 2) return "Give your Autopilot a name.";
    if (s === 1 && schedule.days.length === 0) return "Choose at least one day.";
    if (s === 1 && schedule.times.some((t) => !/^([01]\d|2[0-3]):[0-5]\d$/.test(t))) return "Fix the times (like 09:00).";
    if (s === 2 && needsChannel) return "Choose where to post.";
    return null;
  }

  async function turnOn() {
    setBusy(true);
    setError(null);
    const capNumber = cap.trim() === "" ? null : Math.floor(Number(cap));
    const res = await callApi<{ item: { id: string } }>("/api/autopilots", {
      method: "POST",
      body: JSON.stringify({
        name: v.name.trim(),
        brandId: v.brandId,
        mode,
        contentKind: v.contentKind,
        seconds: v.contentKind === "VIDEO" ? v.seconds : null,
        aspectRatio: v.aspectRatio,
        productIds: v.productIds,
        characterIds: v.characterIds,
        templateId: v.templateId,
        channelIds,
        guidance: v.guidance,
        schedule,
        monthlyCreditCap: capNumber && capNumber > 0 ? capNumber : null,
        enabled: true,
      }),
    });
    setBusy(false);
    if (res.error) return setError(res.error);
    router.push(`/app/autopilot/${res.data!.item.id}?created=1`);
  }

  const go = (to: number) => {
    const p = to > step ? problemFor(step) : null;
    if (p) return setError(p);
    setError(null);
    setStep(to);
  };

  return (
    <div className="max-w-2xl">
      <ol className="mb-5 flex flex-wrap gap-2" aria-label="Steps">
        {STEPS.map((label, i) => (
          <li key={label} aria-current={i === step ? "step" : undefined}>
            <button type="button" onClick={() => i < step && go(i)} className={`flex min-h-[36px] items-center gap-2 rounded-full border px-3 text-sm ${i === step ? "border-primary bg-primary/15 text-ink" : i < step ? "border-line text-ink" : "border-line text-muted"}`}>
              <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] ${i < step ? "bg-success text-onprimary" : "bg-wash/10"}`}>{i < step ? <Check className="h-3 w-3" /> : i + 1}</span>
              {label}
            </button>
          </li>
        ))}
      </ol>

      <div className="card space-y-5 p-5">
        {step === 0 && (
          <>
            <div>
              <label className="label" htmlFor="ap-name">Name</label>
              <input id="ap-name" className="input" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} placeholder="e.g. Weekend specials" maxLength={80} />
            </div>
            <div>
              <label className="label" htmlFor="ap-brand">Brand</label>
              <select id="ap-brand" className="input" value={v.brandId} onChange={(e) => { setV({ ...v, brandId: e.target.value, productIds: [] }); setChannelIds([]); }}>
                {options.brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
            <div>
              <p className="label">What should it make?</p>
              <div className="flex flex-wrap gap-2" role="group" aria-label="Kind of post">
                <button type="button" className={pill(v.contentKind === "IMAGE")} aria-pressed={v.contentKind === "IMAGE"} onClick={() => setV({ ...v, contentKind: "IMAGE" })}>Pictures</button>
                <button type="button" className={pill(v.contentKind === "VIDEO")} aria-pressed={v.contentKind === "VIDEO"} onClick={() => setV({ ...v, contentKind: "VIDEO" })}>Short videos</button>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
                <label className="flex items-center gap-2">Shape
                  <select className="input w-auto" value={v.aspectRatio} onChange={(e) => setV({ ...v, aspectRatio: e.target.value })}>
                    {ASPECT_RATIOS.map((a) => <option key={a} value={a}>{a}</option>)}
                  </select>
                </label>
                {v.contentKind === "VIDEO" && (
                  <label className="flex items-center gap-2">Length
                    <select className="input w-auto" value={v.seconds} onChange={(e) => setV({ ...v, seconds: Number(e.target.value) })}>
                      {[5, 10, 15, 20, 30].map((s) => <option key={s} value={s}>{s} seconds</option>)}
                    </select>
                  </label>
                )}
              </div>
            </div>
            <div>
              <p className="label">Products to feature <span className="font-normal text-muted">(it takes turns; leave empty for brand-only posts)</span></p>
              {products.length === 0 ? (
                <p className="text-sm text-muted">This brand has no products yet. Posts will be about the brand.</p>
              ) : (
                <ul className="flex flex-wrap gap-2">
                  {products.map((p) => {
                    const on = v.productIds.includes(p.id);
                    return (
                      <li key={p.id}>
                        <button type="button" aria-pressed={on} onClick={() => setV({ ...v, productIds: toggle(v.productIds, p.id, 20) })} className={`flex min-h-[40px] items-center gap-2 rounded-full border py-1 pl-1 pr-3 text-sm ${on ? "border-primary bg-primary/15 text-ink" : "border-line text-muted hover:text-ink"}`}>
                          {p.cover ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={p.cover} alt="" className="h-7 w-7 rounded-full object-cover" />
                          ) : (
                            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/20 text-xs text-primary">{p.name.slice(0, 1)}</span>
                          )}
                          {p.name}{p.outOfStock ? " (out of stock)" : ""}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
            {options.characters.length > 0 && (
              <div>
                <p className="label">Characters <span className="font-normal text-muted">(optional, up to 3)</span></p>
                <ul className="flex flex-wrap gap-2">
                  {options.characters.map((c) => (
                    <li key={c.id}>
                      <button type="button" aria-pressed={v.characterIds.includes(c.id)} onClick={() => setV({ ...v, characterIds: toggle(v.characterIds, c.id, 3) })} className={pill(v.characterIds.includes(c.id))}>{c.name}</button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {options.templates.length > 0 && (
              <div>
                <label className="label" htmlFor="ap-template">Template <span className="font-normal text-muted">(optional)</span></label>
                <select id="ap-template" className="input" value={v.templateId ?? ""} onChange={(e) => setV({ ...v, templateId: e.target.value || null })}>
                  <option value="">No template</option>
                  {options.templates.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
                </select>
              </div>
            )}
            <div>
              <label className="label" htmlFor="ap-guidance">Anything it should keep in mind? <span className="font-normal text-muted">(optional)</span></label>
              <textarea id="ap-guidance" className="input min-h-[80px] py-2" value={v.guidance} onChange={(e) => setV({ ...v, guidance: e.target.value })} maxLength={600} placeholder="e.g. Weekend family offers, warm and cheerful, show the food close up" />
            </div>
          </>
        )}

        {step === 1 && (
          <>
            <div>
              <p className="label">Which days?</p>
              <div className="flex flex-wrap gap-2" role="group" aria-label="Days">
                {WEEKDAYS.map((d) => (
                  <button key={d.n} type="button" aria-pressed={schedule.days.includes(d.n)} className={pill(schedule.days.includes(d.n))} onClick={() => setSchedule({ ...schedule, days: toggle(schedule.days, d.n) })}>{d.short}</button>
                ))}
              </div>
              <div className="mt-2 flex gap-2 text-xs">
                <button type="button" className="text-primary hover:underline" onClick={() => setSchedule({ ...schedule, days: [1, 2, 3, 4, 5] })}>Weekdays</button>
                <button type="button" className="text-primary hover:underline" onClick={() => setSchedule({ ...schedule, days: [1, 2, 3, 4, 5, 6, 7] })}>Every day</button>
              </div>
            </div>
            <div>
              <p className="label">At what time? <span className="font-normal text-muted">({tz.replace("_", " ")} time)</span></p>
              <ul className="space-y-2">
                {schedule.times.map((t, i) => (
                  <li key={i} className="flex items-center gap-2">
                    <input type="time" aria-label={`Time ${i + 1}`} className="input w-auto" value={t} onChange={(e) => setSchedule({ ...schedule, times: schedule.times.map((x, j) => (j === i ? e.target.value : x)) })} />
                    {schedule.times.length > 1 && <button type="button" className="btn-quiet" onClick={() => setSchedule({ ...schedule, times: schedule.times.filter((_, j) => j !== i) })}>Remove</button>}
                  </li>
                ))}
              </ul>
              {schedule.times.length < MAX_TIMES_PER_DAY && (
                <button type="button" className="btn-quiet mt-2" onClick={() => setSchedule({ ...schedule, times: [...schedule.times, "17:00"] })}>Add another time</button>
              )}
            </div>
            <div className="rounded-xl bg-surface p-3 text-sm">
              <p className="font-medium text-ink">{describeSchedule(schedule)}</p>
              {next.length > 0 && (
                <p className="mt-1 text-muted">Next: {next.map((d) => when.format(d)).join(" · ")}</p>
              )}
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <fieldset>
              <legend className="label">When a post is ready</legend>
              <div className="space-y-2">
                <label className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 ${mode === "APPROVE_FIRST" ? "border-primary bg-primary/10" : "border-line"}`}>
                  <input type="radio" name="mode" className="mt-1" checked={mode === "APPROVE_FIRST"} onChange={() => setMode("APPROVE_FIRST")} />
                  <span><span className="font-medium text-ink">Ask me to approve it first</span><span className="block text-sm text-muted">Nothing goes out until you press Approve. You can change the caption. Recommended while you are getting started.</span></span>
                </label>
                <label className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 ${mode === "AUTO_POST" ? "border-primary bg-primary/10" : "border-line"}`}>
                  <input type="radio" name="mode" className="mt-1" checked={mode === "AUTO_POST"} onChange={() => setMode("AUTO_POST")} />
                  <span><span className="font-medium text-ink">Post it automatically</span><span className="block text-sm text-muted">It is published as soon as it is ready, and you are told afterwards. You can switch it off at any time.</span></span>
                </label>
              </div>
            </fieldset>
            <div>
              <p className="label">Where should it go?</p>
              {channels.length === 0 ? (
                <p className="text-sm text-danger">No Facebook or Instagram account is connected for this brand.</p>
              ) : (
                <ul className="flex flex-wrap gap-2">
                  {channels.map((c) => (
                    <li key={c.id}>
                      <button type="button" aria-pressed={channelIds.includes(c.id)} className={pill(channelIds.includes(c.id))} onClick={() => setChannelIds(toggle(channelIds, c.id, 6))}>{c.name} · {c.platform === "INSTAGRAM" ? "Instagram" : "Facebook"}</button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <label className="label" htmlFor="ap-cap">Monthly limit, in credits <span className="font-normal text-muted">(optional)</span></label>
              <input id="ap-cap" className="input w-40" inputMode="numeric" value={cap} onChange={(e) => setCap(e.target.value)} placeholder="no limit" />
              <p className="mt-1 text-xs text-muted">When the limit would be passed, Autopilot skips the post and tells you.</p>
            </div>
          </>
        )}

        {step === 3 && (
          <div className="space-y-3 text-sm">
            <h2 className="text-base font-semibold text-ink">{v.name}</h2>
            <dl className="grid gap-x-4 gap-y-2 sm:grid-cols-[8rem_1fr]">
              <dt className="text-muted">Brand</dt><dd className="text-ink">{brand?.name}</dd>
              <dt className="text-muted">Makes</dt><dd className="text-ink">{v.contentKind === "IMAGE" ? "Pictures" : `${v.seconds}-second videos`}, {v.aspectRatio}</dd>
              <dt className="text-muted">Features</dt><dd className="text-ink">{v.productIds.length ? v.productIds.map((id) => options.products.find((p) => p.id === id)?.name).filter(Boolean).join(", ") : "The brand"}</dd>
              <dt className="text-muted">When</dt><dd className="text-ink">{describeSchedule(schedule)}</dd>
              <dt className="text-muted">Then</dt><dd className="text-ink">{mode === "APPROVE_FIRST" ? "Waits for your approval" : "Posts automatically"}</dd>
              <dt className="text-muted">Goes to</dt><dd className="text-ink">{channelIds.map((id) => options.channels.find((c) => c.id === id)?.name).filter(Boolean).join(", ")}</dd>
            </dl>
            <div className="rounded-xl bg-surface p-3">
              <p className="text-ink">About <strong>{perPost} credits</strong> a post ({formatKES(creditsToCents(pricing, perPost))}), roughly <strong>{monthly} credits</strong> a month.</p>
              <p className="mt-1 text-muted">If the wallet runs short, Autopilot skips that post and tells you; it never goes into debt.</p>
            </div>
          </div>
        )}

        {error && <p className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger" role="alert">{error}</p>}

        <div className="flex flex-wrap gap-3">
          {step > 0 && <button type="button" className="btn-quiet" disabled={busy} onClick={() => go(step - 1)}>Back</button>}
          {step < STEPS.length - 1 ? (
            <button type="button" className="btn-primary ml-auto" onClick={() => go(step + 1)}>Next</button>
          ) : (
            <button type="button" className="btn-primary ml-auto" disabled={busy} onClick={() => void turnOn()}>
              {busy && <LoaderIcon className="h-4 w-4 animate-spin" />} Turn on Autopilot
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
