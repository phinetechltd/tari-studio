"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { callApi } from "@/components/json-form";
import { Badge } from "@/components/ui";
import { LIMIT_LABELS, type LimitKey, type Limits } from "@/lib/limits";

interface ModuleRow {
  key: string;
  name: string;
  summary: string;
  requires: string[];
  comingSoon: boolean;
  release: string;
}

interface Props {
  orgId: string;
  plan: string;
  status: string;
  plans: string[];
  enabledModules: string[];
  modules: ModuleRow[];
  limitKeys: LimitKey[];
  overrides: Record<string, number | null>;
  effective: Limits;
}

export function OrgControls(props: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [moduleErrors, setModuleErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  const enabled = new Set(props.enabledModules);

  async function toggleModule(key: string, next: boolean) {
    setBusy(key);
    setModuleErrors((e) => ({ ...e, [key]: "" }));
    const res = await callApi(`/api/platform/orgs/${props.orgId}/modules/${key}`, "PUT", { enabled: next });
    setBusy(null);
    if (!res.ok) return setModuleErrors((e) => ({ ...e, [key]: res.error?.message ?? "Could not change it." }));
    router.refresh();
  }

  async function patch(body: unknown, okText: string) {
    setMessage(null);
    const res = await callApi(`/api/platform/orgs/${props.orgId}`, "PATCH", body);
    if (!res.ok) return setMessage({ tone: "error", text: res.error?.message ?? "Could not save." });
    setMessage({ tone: "ok", text: okText });
    router.refresh();
  }

  async function saveLimits(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const limits: Record<string, number | null> = {};
    for (const key of props.limitKeys) {
      if (form.get(`${key}:unlimited`)) limits[key] = null;
      else {
        const raw = String(form.get(key) ?? "").trim();
        if (raw !== "") limits[key] = Number(raw);
      }
    }
    await patch({ limits }, "Limits saved. Blank fields follow the plan.");
  }

  return (
    <div className="space-y-8">
      {message ? (
        <p
          role={message.tone === "error" ? "alert" : "status"}
          className={`rounded-lg border px-3 py-2 text-sm ${
            message.tone === "error" ? "border-danger/40 bg-danger/10 text-danger" : "border-success/40 bg-success/10 text-success"
          }`}
        >
          {message.text}
        </p>
      ) : null}

      <section aria-labelledby="plan" className="card p-5">
        <h2 id="plan" className="mb-3 text-lg font-medium">
          Plan and status
        </h2>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="plan-select" className="label">
              Plan
            </label>
            <select
              id="plan-select"
              className="input"
              defaultValue={props.plan}
              onChange={(e) => patch({ plan: e.target.value }, "Plan changed.")}
            >
              {props.plans.map((p) => (
                <option key={p} value={p}>
                  {p.charAt(0) + p.slice(1).toLowerCase()}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            className={props.status === "ACTIVE" ? "btn-quiet text-danger" : "btn-primary"}
            onClick={() => {
              if (props.status === "ACTIVE" && !window.confirm("Suspend this organisation? Everyone in it loses access immediately.")) return;
              void patch({ status: props.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE" }, props.status === "ACTIVE" ? "Suspended." : "Reactivated.");
            }}
          >
            {props.status === "ACTIVE" ? "Suspend" : "Reactivate"}
          </button>
        </div>
      </section>

      <section aria-labelledby="modules">
        <h2 id="modules" className="mb-3 text-lg font-medium">
          Modules
        </h2>
        <ul className="grid gap-3 sm:grid-cols-2">
          {props.modules.map((m) => {
            const on = enabled.has(m.key);
            return (
              <li key={m.key} className="card p-4">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-medium">{m.name}</h3>
                  {m.comingSoon ? <Badge>Coming {m.release}</Badge> : on ? <Badge tone="success">Enabled</Badge> : <Badge>Off</Badge>}
                </div>
                <p className="mt-1 text-sm text-muted">{m.summary}</p>
                {m.requires.length > 0 ? <p className="mt-1 text-xs text-muted">Needs: {m.requires.join(", ")}</p> : null}
                {!m.comingSoon ? (
                  <div className="mt-3">
                    <button
                      type="button"
                      className={on ? "btn-quiet !min-h-[40px]" : "btn-primary !min-h-[40px]"}
                      disabled={busy === m.key}
                      onClick={() => toggleModule(m.key, !on)}
                    >
                      {on ? "Disable" : "Enable"}
                    </button>
                    {moduleErrors[m.key] ? (
                      <p role="alert" className="mt-2 text-xs text-danger">
                        {moduleErrors[m.key]}
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      </section>

      <section aria-labelledby="limits" className="card p-5">
        <h2 id="limits" className="mb-1 text-lg font-medium">
          Limit overrides
        </h2>
        <p className="mb-4 text-sm text-muted">Leave a field blank to follow the plan. Placeholder shows the plan&apos;s value.</p>
        <form onSubmit={saveLimits} className="space-y-3">
          {props.limitKeys.map((k) => {
            const override = props.overrides[k];
            return (
              <div key={k} className="grid items-end gap-2 sm:grid-cols-[1fr_10rem_auto]">
                <label htmlFor={`limit-${k}`} className="label !mb-0">
                  {LIMIT_LABELS[k]}
                </label>
                <input
                  id={`limit-${k}`}
                  name={k}
                  type="number"
                  min={0}
                  inputMode="numeric"
                  className="input"
                  defaultValue={typeof override === "number" ? override : ""}
                  placeholder={props.effective[k] === null ? "Unlimited" : String(props.effective[k])}
                />
                <label className="flex min-h-[44px] items-center gap-2 text-sm">
                  <input type="checkbox" name={`${k}:unlimited`} defaultChecked={override === null} />
                  Unlimited
                </label>
              </div>
            );
          })}
          <button type="submit" className="btn-primary">
            Save limits
          </button>
        </form>
      </section>
    </div>
  );
}
