"use client";

import { Bot, Plus, Trash, Workflow, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { callApi } from "@/components/json-form";
import {
  ACTION_LABELS,
  actionsAllowedFor,
  STAGE_LABELS,
  STAGES,
  TRIGGER_LABELS,
  TRIGGERS,
  type Action,
  type ActionType,
  type Trigger,
} from "@/lib/automation-rules";
import { cn } from "@/lib/utils";

export interface AutomationView {
  id: string;
  name: string;
  brandId: string | null;
  brand: { name: string } | null;
  trigger: string;
  conditions: { match?: "any" | "keywords"; keywords?: string[] } | null;
  actions: Action[];
  enabled: boolean;
  runCount: number;
  lastRunAt: string | Date | null;
}

export interface RunView {
  id: string;
  status: string;
  error: string | null;
  eventKey: string;
  createdAt: string | Date;
  automation: { name: string; trigger: string };
  detail: { steps?: Array<{ type: string; ok: boolean; note?: string }>; reason?: string } | null;
}

interface Draft {
  id?: string;
  name: string;
  brandId: string;
  trigger: Trigger;
  match: "any" | "keywords";
  keywords: string;
  actions: Action[];
  enabled: boolean;
}

const BLANK: Draft = { name: "", brandId: "", trigger: "MESSAGE_RECEIVED", match: "any", keywords: "", actions: [{ type: "SEND_REPLY", text: "" }], enabled: true };

const TEMPLATES: Array<{ label: string; description: string; draft: Draft }> = [
  {
    label: "Welcome new leads",
    description: "Greets a first-time contact, tags them and tells the team.",
    draft: {
      ...BLANK,
      name: "Welcome new leads",
      trigger: "LEAD_CREATED",
      actions: [
        { type: "SEND_REPLY", text: "Hi {{name}}, thanks for messaging {{brand}}! A member of our team will reply shortly. Meanwhile, tell us what you are looking for." },
        { type: "ADD_TAG", tag: "new-lead" },
        { type: "NOTIFY_TEAM", message: "New WhatsApp lead" },
      ],
    },
  },
  {
    label: "Answer price questions with AI",
    description: "When someone asks about price, AI answers from your catalogue and qualifies the lead.",
    draft: {
      ...BLANK,
      name: "Price questions",
      trigger: "MESSAGE_RECEIVED",
      match: "keywords",
      keywords: "price, cost, how much, bei, pesa",
      actions: [
        { type: "AI_REPLY", instructions: "Quote prices only from the catalogue. Ask which product and how many they need." },
        { type: "SET_STAGE", stage: "QUALIFIED" },
      ],
    },
  },
  {
    label: "Alert on failed posts",
    description: "Notifies the team when a scheduled post does not go out.",
    draft: { ...BLANK, name: "Failed post alert", trigger: "POST_FAILED", actions: [{ type: "NOTIFY_TEAM", message: "A scheduled post failed to publish" }] },
  },
];

function toDraft(a: AutomationView): Draft {
  return {
    id: a.id,
    name: a.name,
    brandId: a.brandId ?? "",
    trigger: (TRIGGERS as readonly string[]).includes(a.trigger) ? (a.trigger as Trigger) : "MESSAGE_RECEIVED",
    match: a.conditions?.match ?? "any",
    keywords: (a.conditions?.keywords ?? []).join(", "),
    actions: a.actions,
    enabled: a.enabled,
  };
}

function blankAction(type: ActionType): Action {
  switch (type) {
    case "SEND_REPLY":
      return { type, text: "" };
    case "AI_REPLY":
      return { type, instructions: "" };
    case "SET_STAGE":
      return { type, stage: "QUALIFIED" };
    case "ADD_TAG":
      return { type, tag: "" };
    case "NOTIFY_TEAM":
      return { type, message: "" };
  }
}

function describeAction(a: Action): string {
  switch (a.type) {
    case "SEND_REPLY":
      return "send a reply";
    case "AI_REPLY":
      return "answer with AI from the catalogue";
    case "SET_STAGE":
      return `move the lead to ${STAGE_LABELS[a.stage]}`;
    case "ADD_TAG":
      return `tag “${a.tag}”`;
    case "NOTIFY_TEAM":
      return "notify the team";
  }
}

function summary(a: AutomationView): string {
  const when =
    a.trigger === "MESSAGE_RECEIVED" && a.conditions?.match === "keywords"
      ? `A message mentions ${(a.conditions.keywords ?? []).map((k) => `“${k}”`).join(", ")}`
      : TRIGGER_LABELS[a.trigger as Trigger] ?? a.trigger;
  return `${when} → ${a.actions.map(describeAction).join(", then ")}`;
}

export function AutomationsApp(props: {
  automations: AutomationView[];
  runs: RunView[];
  brands: Array<{ id: string; name: string }>;
  canEdit: boolean;
  aiAvailable: boolean;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const allowed = useMemo(() => (draft ? actionsAllowedFor(draft.trigger) : []), [draft]);

  const save = async () => {
    if (!draft) return;
    setPending(true);
    setError(null);
    const body = {
      name: draft.name,
      brandId: draft.brandId || null,
      trigger: draft.trigger,
      conditions: {
        match: draft.trigger === "MESSAGE_RECEIVED" ? draft.match : "any",
        keywords: draft.keywords.split(",").map((k) => k.trim()).filter(Boolean),
      },
      actions: draft.actions.filter((a) => allowed.includes(a.type)),
      enabled: draft.enabled,
    };
    const r = draft.id ? await callApi(`/api/automations/${draft.id}`, "PUT", body) : await callApi("/api/automations", "POST", body);
    setPending(false);
    if (!r.ok) {
      const issues = (r.error?.details as { issues?: Array<{ message: string }> } | undefined)?.issues;
      return setError(issues?.length ? issues.map((i) => i.message).join(" ") : r.error?.message ?? "Not saved.");
    }
    setDraft(null);
    router.refresh();
  };

  const toggle = async (a: AutomationView) => {
    const r = await callApi(`/api/automations/${a.id}`, "PATCH", { enabled: !a.enabled });
    if (!r.ok) return setError(r.error?.message ?? "Not changed.");
    router.refresh();
  };

  const remove = async (a: AutomationView) => {
    if (!window.confirm(`Delete “${a.name}”? Its run history goes with it.`)) return;
    const r = await callApi(`/api/automations/${a.id}`, "DELETE");
    if (!r.ok) return setError(r.error?.message ?? "Not deleted.");
    router.refresh();
  };

  const setAction = (i: number, next: Action) => setDraft((d) => (d ? { ...d, actions: d.actions.map((a, j) => (j === i ? next : a)) } : d));

  return (
    <div className="space-y-8">
      {error && !draft ? (
        <p role="alert" className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      ) : null}

      {props.canEdit && !draft ? (
        <section aria-label="Start from a template" className="grid gap-3 md:grid-cols-3">
          {TEMPLATES.map((t) => (
            <button
              key={t.label}
              type="button"
              onClick={() => {
                setError(null);
                setDraft({ ...t.draft, brandId: props.brands.length === 1 ? props.brands[0]!.id : "" });
              }}
              className="card p-4 text-left transition-colors hover:bg-wash/[0.07]"
            >
              <p className="flex items-center gap-2 font-semibold">
                {t.draft.actions.some((a) => a.type === "AI_REPLY") ? <Bot className="h-4 w-4 text-primary" /> : <Workflow className="h-4 w-4 text-primary" />}
                {t.label}
              </p>
              <p className="mt-1 text-sm text-muted">{t.description}</p>
            </button>
          ))}
        </section>
      ) : null}

      {draft ? (
        <section className="panel space-y-5 p-5" aria-label={draft.id ? "Edit automation" : "New automation"}>
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">{draft.id ? "Edit automation" : "New automation"}</h2>
            <button type="button" onClick={() => setDraft(null)} className="btn-ghost min-h-[32px] px-2" aria-label="Close">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="label" htmlFor="a-name">
                Name
              </label>
              <input id="a-name" className="input" value={draft.name} maxLength={120} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            </div>
            <div>
              <label className="label" htmlFor="a-brand">
                Brand
              </label>
              <select id="a-brand" className="input" value={draft.brandId} onChange={(e) => setDraft({ ...draft, brandId: e.target.value })}>
                <option value="">Every brand</option>
                {props.brands.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="label" htmlFor="a-trigger">
              When
            </label>
            <select
              id="a-trigger"
              className="input"
              value={draft.trigger}
              onChange={(e) => {
                const trigger = e.target.value as Trigger;
                const ok = actionsAllowedFor(trigger);
                const kept = draft.actions.filter((a) => ok.includes(a.type));
                setDraft({ ...draft, trigger, actions: kept.length ? kept : [blankAction(ok[0]!)] });
              }}
            >
              {TRIGGERS.map((t) => (
                <option key={t} value={t}>
                  {TRIGGER_LABELS[t]}
                </option>
              ))}
            </select>
          </div>

          {draft.trigger === "MESSAGE_RECEIVED" ? (
            <fieldset className="space-y-2">
              <legend className="label">Only if</legend>
              <div className="flex flex-wrap gap-4 text-sm">
                <label className="flex items-center gap-2">
                  <input type="radio" name="match" checked={draft.match === "any"} onChange={() => setDraft({ ...draft, match: "any" })} /> Any message
                </label>
                <label className="flex items-center gap-2">
                  <input type="radio" name="match" checked={draft.match === "keywords"} onChange={() => setDraft({ ...draft, match: "keywords" })} /> The message mentions a keyword
                </label>
              </div>
              {draft.match === "keywords" ? (
                <input
                  className="input"
                  placeholder="price, cost, bei, delivery"
                  value={draft.keywords}
                  onChange={(e) => setDraft({ ...draft, keywords: e.target.value })}
                  aria-label="Keywords, separated by commas"
                />
              ) : null}
            </fieldset>
          ) : null}

          <div className="space-y-3">
            <p className="label">Then</p>
            {draft.actions.map((a, i) => (
              <div key={i} className="card flex flex-col gap-3 p-3 sm:flex-row sm:items-start">
                <span className="mt-2 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-wash/10 text-xs font-semibold">{i + 1}</span>
                <div className="flex-1 space-y-2">
                  <select
                    className="input"
                    value={a.type}
                    aria-label={`Step ${i + 1}`}
                    onChange={(e) => setAction(i, blankAction(e.target.value as ActionType))}
                  >
                    {allowed.map((t) => (
                      <option key={t} value={t} disabled={t === "AI_REPLY" && !props.aiAvailable}>
                        {ACTION_LABELS[t]}
                        {t === "AI_REPLY" && !props.aiAvailable ? " (needs AI Content)" : ""}
                      </option>
                    ))}
                  </select>
                  {a.type === "SEND_REPLY" ? (
                    <>
                      <textarea className="input py-2" rows={3} maxLength={1000} value={a.text} onChange={(e) => setAction(i, { ...a, text: e.target.value })} aria-label="Reply text" />
                      <p className="text-xs text-muted">You can use {"{{name}}"} and {"{{brand}}"}.</p>
                    </>
                  ) : null}
                  {a.type === "AI_REPLY" ? (
                    <>
                      <textarea
                        className="input py-2"
                        rows={2}
                        maxLength={1000}
                        placeholder="Optional guidance, e.g. “Ask which estate they are in for delivery.”"
                        value={a.instructions}
                        onChange={(e) => setAction(i, { ...a, instructions: e.target.value })}
                        aria-label="Guidance for the AI"
                      />
                      <p className="text-xs text-muted">Answers use only your catalogue for prices and products; anything else is passed to a person.</p>
                    </>
                  ) : null}
                  {a.type === "SET_STAGE" ? (
                    <select className="input" value={a.stage} onChange={(e) => setAction(i, { ...a, stage: e.target.value as (typeof STAGES)[number] })} aria-label="Stage">
                      {STAGES.map((s) => (
                        <option key={s} value={s}>
                          {STAGE_LABELS[s]}
                        </option>
                      ))}
                    </select>
                  ) : null}
                  {a.type === "ADD_TAG" ? (
                    <input className="input" maxLength={40} value={a.tag} placeholder="e.g. price-enquiry" onChange={(e) => setAction(i, { ...a, tag: e.target.value })} aria-label="Tag" />
                  ) : null}
                  {a.type === "NOTIFY_TEAM" ? (
                    <input className="input" maxLength={300} value={a.message} placeholder="What the team sees" onChange={(e) => setAction(i, { ...a, message: e.target.value })} aria-label="Notification" />
                  ) : null}
                </div>
                {draft.actions.length > 1 ? (
                  <button
                    type="button"
                    onClick={() => setDraft({ ...draft, actions: draft.actions.filter((_, j) => j !== i) })}
                    className="btn-ghost min-h-[32px] self-end px-2 sm:self-start"
                    aria-label={`Remove step ${i + 1}`}
                  >
                    <Trash className="h-4 w-4" />
                  </button>
                ) : null}
              </div>
            ))}
            {draft.actions.length < 6 ? (
              <button
                type="button"
                onClick={() => setDraft({ ...draft, actions: [...draft.actions, blankAction(allowed.includes("NOTIFY_TEAM") ? "NOTIFY_TEAM" : allowed[0]!)] })}
                className="btn-quiet min-h-[36px] text-sm"
              >
                <Plus className="h-4 w-4" /> Add a step
              </button>
            ) : null}
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={draft.enabled} onChange={(e) => setDraft({ ...draft, enabled: e.target.checked })} /> Switched on
          </label>

          {error ? (
            <p role="alert" className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
              {error}
            </p>
          ) : null}
          <div className="flex gap-2">
            <button type="button" onClick={() => void save()} disabled={pending} className="btn-primary">
              {pending ? "Saving…" : draft.id ? "Save changes" : "Create automation"}
            </button>
            <button type="button" onClick={() => setDraft(null)} className="btn-ghost">
              Cancel
            </button>
          </div>
        </section>
      ) : null}

      <section aria-labelledby="rules">
        <div className="mb-3 flex items-center justify-between">
          <h2 id="rules" className="text-lg font-semibold">
            Your automations
          </h2>
          {props.canEdit && !draft ? (
            <button type="button" onClick={() => setDraft({ ...BLANK, brandId: props.brands.length === 1 ? props.brands[0]!.id : "" })} className="btn-primary">
              <Plus className="h-4 w-4" /> New automation
            </button>
          ) : null}
        </div>
        {props.automations.length === 0 ? (
          <div className="rounded-card border border-dashed border-wash/10 px-6 py-10 text-center text-sm text-muted">
            No automations yet. Start from a template above.
          </div>
        ) : (
          <ul className="grid gap-3 lg:grid-cols-2">
            {props.automations.map((a) => (
              <li key={a.id} className={cn("card p-4", !a.enabled && "opacity-70")}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold">{a.name}</p>
                    <p className="mt-1 text-sm text-muted">{summary(a)}</p>
                    <p className="mt-2 text-xs text-muted">
                      {a.brand ? `${a.brand.name} · ` : "Every brand · "}
                      {a.runCount} run{a.runCount === 1 ? "" : "s"}
                      {a.lastRunAt ? ` · last ${new Date(a.lastRunAt).toLocaleString("en-KE", { dateStyle: "medium", timeStyle: "short" })}` : ""}
                    </p>
                  </div>
                  {props.canEdit ? (
                    <button
                      type="button"
                      role="switch"
                      aria-checked={a.enabled}
                      aria-label={a.enabled ? `Switch off ${a.name}` : `Switch on ${a.name}`}
                      onClick={() => void toggle(a)}
                      className={cn("relative h-6 w-11 shrink-0 rounded-full transition-colors", a.enabled ? "bg-primary" : "bg-wash/15")}
                    >
                      <span className={cn("absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all", a.enabled ? "left-[22px]" : "left-0.5")} />
                    </button>
                  ) : null}
                </div>
                {props.canEdit ? (
                  <div className="mt-3 flex gap-2">
                    <button type="button" onClick={() => setDraft(toDraft(a))} className="btn-quiet min-h-[32px] px-3 text-xs">
                      Edit
                    </button>
                    {!a.enabled ? (
                      <button type="button" onClick={() => void remove(a)} className="btn-danger min-h-[32px] px-3 text-xs">
                        Delete
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="runs">
        <h2 id="runs" className="mb-3 text-lg font-semibold">
          Recent runs
        </h2>
        {props.runs.length === 0 ? (
          <p className="text-sm text-muted">Nothing has run yet.</p>
        ) : (
          <div className="card overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs text-muted">
                  <th className="px-4 py-2.5 font-medium">When</th>
                  <th className="px-4 py-2.5 font-medium">Automation</th>
                  <th className="px-4 py-2.5 font-medium">Outcome</th>
                  <th className="px-4 py-2.5 font-medium">Steps</th>
                </tr>
              </thead>
              <tbody>
                {props.runs.map((r) => (
                  <tr key={r.id} className="border-b border-line/60 last:border-0">
                    <td className="whitespace-nowrap px-4 py-2.5 text-muted">
                      {new Date(r.createdAt).toLocaleString("en-KE", { dateStyle: "medium", timeStyle: "short" })}
                    </td>
                    <td className="px-4 py-2.5">{r.automation.name}</td>
                    <td className="px-4 py-2.5">
                      <span
                        className={cn(
                          "text-xs font-medium",
                          r.status === "SUCCEEDED" ? "text-success" : r.status === "FAILED" ? "text-danger" : r.status === "SKIPPED" ? "text-muted" : "text-warning",
                        )}
                      >
                        {r.status.charAt(0) + r.status.slice(1).toLowerCase()}
                      </span>
                      {r.error ? <p className="max-w-xs truncate text-xs text-muted" title={r.error}>{r.error}</p> : null}
                      {r.detail?.reason ? <p className="text-xs text-muted">{r.detail.reason}</p> : null}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-muted">
                      {(r.detail?.steps ?? []).map((s, i) => (
                        <span key={i} className={cn("mr-2", s.ok ? "" : "text-danger")}>
                          {s.ok ? "✓" : "✗"} {ACTION_LABELS[s.type as ActionType] ?? s.type}
                        </span>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
