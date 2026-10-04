import { Plus, Repeat } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { RunCard } from "@/components/autopilot/run-card";
import { Hint } from "@/components/hints/hint";
import { RequirementsGate } from "@/components/requirements-gate";
import { Badge, EmptyState, PageHeader } from "@/components/ui";
import { can } from "@/lib/rbac";
import { requirePermission } from "@/lib/session";
import { awaitingApproval, listAutopilots } from "@/server/autopilot";
import { AUTOPILOT_NEEDS, requirements } from "@/server/readiness";

export const metadata: Metadata = { title: "Autopilot" };
export const dynamic = "force-dynamic";

const dateTime = new Intl.DateTimeFormat("en-KE", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Nairobi" });

export default async function AutopilotPage() {
  const { principal, organizationId } = await requirePermission("autopilot:read");
  const [reqs, items, waiting] = await Promise.all([requirements(organizationId, AUTOPILOT_NEEDS), listAutopilots(organizationId), awaitingApproval(organizationId)]);
  const ready = reqs.every((r) => r.ok);
  const canWrite = can(principal, "autopilot:write");
  const canApprove = can(principal, "post:schedule");

  return (
    <>
      <PageHeader
        title="Autopilot"
        subtitle="Makes pictures and videos on a schedule and posts them, or waits for you to approve each one."
        actions={
          canWrite && ready ? (
            <Link href="/app/autopilot/new" className="btn-primary">
              <Plus className="h-4 w-4" /> New Autopilot
            </Link>
          ) : null
        }
      />
      <Hint id="autopilot.intro" title="Start with “ask me first”">
        Autopilot makes the post, writes the caption from your brand and product, and holds it for you. Once you trust it, switch it to post by itself.
      </Hint>

      <RequirementsGate requirements={reqs} blocking={items.length === 0}>
        {items.length === 0 ? (
          <EmptyState title="Put your content on Autopilot" action={canWrite ? <Link href="/app/autopilot/new" className="btn-primary">Set up your first Autopilot</Link> : undefined}>
            Pick a brand and some products, choose the days and times, and decide whether you approve each post first.
          </EmptyState>
        ) : null}
      </RequirementsGate>

      {waiting.length > 0 && (
        <section className="mb-8" aria-labelledby="waiting-h">
          <h2 id="waiting-h" className="mb-3 text-sm font-semibold uppercase tracking-wider text-warning">Waiting for your approval ({waiting.length})</h2>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {waiting.map((r) => (
              <RunCard key={r.id} run={r} title={r.autopilotName} canApprove={canApprove} />
            ))}
          </div>
        </section>
      )}

      {items.length > 0 && (
        <section aria-labelledby="all-h">
          <h2 id="all-h" className="mb-3 text-sm font-semibold uppercase tracking-wider text-primary">Your Autopilots</h2>
          <ul className="space-y-3">
            {items.map((a) => (
              <li key={a.id}>
                <Link href={`/app/autopilot/${a.id}`} className="card flex flex-wrap items-center gap-3 p-4 transition-colors hover:border-primary/50">
                  <Repeat className="h-5 w-5 text-primary" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-ink">{a.name}</p>
                    <p className="text-sm text-muted">{a.brandName} · {a.scheduleText}</p>
                    <p className="text-xs text-muted">
                      {a.mode === "AUTO_POST" ? "Posts automatically" : "Asks you first"}
                      {a.enabled && a.nextRunAt ? ` · next ${dateTime.format(new Date(a.nextRunAt))}` : ""}
                    </p>
                  </div>
                  {a.awaiting > 0 && <Badge tone="warning">{a.awaiting} waiting</Badge>}
                  <Badge tone={a.enabled ? "success" : "neutral"}>{a.enabled ? "On" : a.pausedReason ? "Paused" : "Off"}</Badge>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}