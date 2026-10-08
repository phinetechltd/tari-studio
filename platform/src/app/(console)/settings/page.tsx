import type { Metadata } from "next";
import type { ReactNode } from "react";

import { CopyButton } from "@/components/campaigns/campaign-controls";
import { Hint } from "@/components/hints/hint";
import { AiTestButton } from "@/components/settings/ai-test-button";
import { GatewayForm } from "@/components/settings/gateway-forms";
import { PlatformSettingsEditor } from "@/components/settings/platform-settings-editor";
import { Badge, Notice, PageHeader, SectionTitle, TableWrap } from "@/components/ui";
import { PRODUCT_NAME } from "@/lib/brand";
import { PLATFORM_GROUPS } from "@/lib/platform-settings-catalog";
import { platformSettingsStatus } from "@/server/platform-settings";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { LIMIT_KEYS, LIMIT_LABELS } from "@/lib/limits";
import { MODULE_LIST } from "@/lib/modules";
import { can, ROLE_LABELS } from "@/lib/rbac";
import { requireSession } from "@/lib/session";
import { limitsFor, seatUsage } from "@/lib/tenant";
import { aiStatus } from "@/server/ai";
import { gatewayStatus } from "@/server/gateways";

export const metadata: Metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

function Row(props: { name: string; state: "live" | "simulated" | "missing" | "off"; detail: ReactNode }) {
  const tone = props.state === "live" ? "success" : props.state === "simulated" ? "info" : props.state === "missing" ? "danger" : "neutral";
  const label = props.state === "live" ? "Live" : props.state === "simulated" ? "Simulator" : props.state === "missing" ? "Needs setup" : "Off";
  return (
    <li className="flex flex-col gap-1 border-b border-wash/[0.06] py-3 last:border-0 sm:flex-row sm:items-start sm:gap-4">
      <span className="w-48 shrink-0 font-medium">{props.name}</span>
      <span className="flex-1 text-sm text-muted">{props.detail}</span>
      <Badge tone={tone}>{label}</Badge>
    </li>
  );
}

/**
 * Settings: what this deployment is connected to (never a secret, only whether
 * one is loaded), a live AI test, the organisation's own social media app
 * credentials (sealed at rest, src/server/gateways.ts), and its modules and
 * limits. AI and payment credentials are platform-managed by the platform
 * admin; agencies cannot enter their own.
 */
export default async function SettingsPage() {
  const { principal } = await requireSession();
  const e = env();
  const ai = aiStatus();
  const gateways = await gatewayStatus(principal.organizationId ?? null);
  const canWrite = Boolean(principal.organizationId) && can(principal, "org:write");
  const base = e.APP_BASE_URL.replace(/\/$/, "");
  const orgId = principal.organizationId;
  const [org, limits, seats] = orgId
    ? await Promise.all([
        db.organization.findUnique({ where: { id: orgId }, select: { name: true, slug: true, plan: true } }),
        limitsFor(orgId),
        seatUsage(orgId),
      ])
    : [null, null, null];

  // Deployment-wide keys are for platform admins working in platform mode.
  const platformMode = principal.role === "SUPER_ADMIN" && !orgId;
  const [platform, me] = await Promise.all([
    platformMode ? platformSettingsStatus() : null,
    db.user.findUnique({ where: { id: principal.userId }, select: { isPlatformAdmin: true } }),
  ]);

  const aiPrimary = ai.chain[0];

  return (
    <>
      <PageHeader
        title="Settings"
        subtitle={org ? `${org.name} · ${ROLE_LABELS[principal.role]} · ${org.plan.charAt(0)}${org.plan.slice(1).toLowerCase()} plan` : "Platform admin"}
      />
      <Hint id="settings.intro" title="Most teams never need to change these">
        AI runs on {PRODUCT_NAME}'s platform-managed models; your plan's limits are listed below. Here you connect
        your own social media app and see what this deployment is using.
      </Hint>

      {platform ? (
        <section className="mb-8" aria-labelledby="deployment">
          <SectionTitle id="deployment">Deployment keys</SectionTitle>
          <p className="mb-4 max-w-3xl text-sm text-muted">
            Set the AI keys and every other provider for the whole platform here instead of the server's .env. Keys are
            sealed on the server and never shown again. Every agency runs on these keys; agencies only manage their
            own social media apps.
          </p>
          <PlatformSettingsEditor groups={PLATFORM_GROUPS} settings={platform.settings} vaultReady={platform.vaultReady} />
        </section>
      ) : me?.isPlatformAdmin ? (
        <Notice tone="info" title="Looking for the platform-wide keys?">
          Switch to “Platform admin” in the menu at the bottom left, then open Settings. Keys set there apply to every agency.
        </Notice>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="card p-5" aria-labelledby="ai">
          <SectionTitle id="ai">AI models</SectionTitle>
          <ul className="mb-4 text-sm">
            {ai.chain.map((c, i) => (
              <Row
                key={`${c.provider}-${i}`}
                name={i === 0 ? "Primary" : `Fallback ${i}`}
                state={c.provider === "fixtures" ? "simulated" : c.keyLoaded ? "live" : "missing"}
                detail={
                  c.provider === "fixtures" ? (
                    platformMode
                      ? "Fixture replies for development. Choose Anthropic and add the key under Deployment keys above to use Claude."
                      : "Fixture replies for development. Ask the platform admin to set the platform's AI key."
                  ) : (
                    <>
                      {c.provider} · {c.model}
                      {c.provider === "anthropic" ? ` (quick tasks: ${c.quickModel})` : ""}
                      {c.keyLoaded ? "" : ` — no ${c.provider === "anthropic" ? "Anthropic" : "NVIDIA"} API key is set`}
                    </>
                  )
                }
              />
            ))}
            {ai.error ? <li className="py-2 text-sm text-danger">{ai.error}</li> : null}
          </ul>
          {orgId && can(principal, "ai:generate") ? <AiTestButton /> : null}
          {aiPrimary?.provider === "fixtures" ? null : <p className="mt-3 text-xs text-muted">Timeout {ai.timeoutSec} s per provider; every call is metered in AI usage with its real token cost.</p>}
        </section>

        <section className="card p-5" aria-labelledby="integrations">
          <SectionTitle id="integrations">{orgId ? "Gateways" : "Webhook"}</SectionTitle>
          {orgId ? (
            <p className="mb-4 text-sm text-muted">
              Your agency's own Meta app, sealed at rest and never shown again. A blank field keeps the current
              value; the platform's settings apply until the agency saves its own. AI and payment keys are not
              managed here — they belong to the platform.
            </p>
          ) : null}
          <div className={orgId ? "space-y-5" : "hidden"}>
            {(["social"] as const).map((key) => {
              const g = gateways.gateways[key];
              if (!g) return null;
              return (
                <details key={key} className="rounded-xl border border-wash/[0.08] p-4">
                  <summary className="cursor-pointer select-none">
                    <span className="font-medium">{g.name}</span>
                    <span className="mt-1 block text-sm text-muted">{g.summary}</span>
                  </summary>
                  <div className="mt-4">
                    {canWrite ? (
                      <GatewayForm gateway={key} status={g} />
                    ) : (
                      <ul className="text-sm">
                        {g.fields.map((f) => (
                          <li key={f.name} className="flex justify-between gap-4 border-b border-wash/[0.06] py-2 last:border-0">
                            <span className="text-muted">{f.label}</span>
                            <span className="text-xs">{f.source === "org" ? "set by this organisation" : f.source === "deployment" ? "deployment default" : "not set"}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </details>
              );
            })}
          </div>
          <ul className="mt-5 text-sm">
            <Row
              name="WhatsApp webhook"
              state={e.META_PROVIDER === "graph" ? (e.META_WEBHOOK_VERIFY_TOKEN ? "live" : "missing") : "simulated"}
              detail={
                <span className="flex flex-wrap items-center gap-2">
                  <code className="truncate rounded bg-wash/[0.06] px-1.5 py-0.5 text-xs text-ink">{`${base}/api/webhooks/whatsapp`}</code>
                  <CopyButton value={`${base}/api/webhooks/whatsapp`} />
                  {e.META_WEBHOOK_VERIFY_TOKEN ? null : <span>META_WEBHOOK_VERIFY_TOKEN is not set.</span>}
                </span>
              }
            />
            <Row
              name="Email"
              state={e.EMAIL_PROVIDER === "smtp" ? "live" : "simulated"}
              detail={e.EMAIL_PROVIDER === "smtp" ? "SMTP" : "Emails are printed to the server log. Set EMAIL_PROVIDER=smtp."}
            />
          </ul>
        </section>
      </div>

      {orgId && limits ? (
        <div className="mt-6 grid gap-6 xl:grid-cols-2">
          <section aria-labelledby="modules">
            <SectionTitle id="modules">Modules</SectionTitle>
            <div className="grid gap-3 sm:grid-cols-2">
              {MODULE_LIST.map((m) => {
                const on = principal.enabledModules.has(m.key);
                return (
                  <div key={m.key} className="card p-4">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-medium">{m.name}</h3>
                      {on ? <Badge tone="success">On</Badge> : m.comingSoon ? <Badge>Coming {m.release}</Badge> : <Badge tone="warning">Not in plan</Badge>}
                    </div>
                    <p className="mt-1 text-sm text-muted">{m.summary}</p>
                  </div>
                );
              })}
            </div>
          </section>
          <section aria-labelledby="limits">
            <SectionTitle id="limits">Plan limits</SectionTitle>
            <TableWrap>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs text-muted">
                    <th className="px-4 py-2.5 font-medium">Limit</th>
                    <th className="px-4 py-2.5 font-medium">Allowed</th>
                    <th className="px-4 py-2.5 font-medium">In use</th>
                  </tr>
                </thead>
                <tbody>
                  {LIMIT_KEYS.map((k) => (
                    <tr key={k} className="border-b border-line/60 last:border-0">
                      <td className="px-4 py-2.5">{LIMIT_LABELS[k]}</td>
                      <td className="px-4 py-2.5">{limits[k] === null ? "Unlimited" : limits[k]!.toLocaleString("en-KE")}</td>
                      <td className="px-4 py-2.5 text-muted">{k === "seats" ? seats : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          </section>
        </div>
      ) : null}
    </>
  );
}
