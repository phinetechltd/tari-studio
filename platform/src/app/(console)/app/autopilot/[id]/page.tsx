import type { Metadata } from "next";
import Link from "next/link";

import { AutopilotControls } from "@/components/autopilot/controls";
import { RunCard } from "@/components/autopilot/run-card";
import { RequirementsGate } from "@/components/requirements-gate";
import { Badge, EmptyState, Notice, PageHeader } from "@/components/ui";
import { can } from "@/lib/rbac";
import { requirePermission } from "@/lib/session";
import { getAutopilot } from "@/server/autopilot";
import { AUTOPILOT_NEEDS, requirements } from "@/server/readiness";

export const metadata: Metadata = { title: "Autopilot" };
export const dynamic = "force-dynamic";

const dateTime = new Intl.DateTimeFormat("en-KE", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Nairobi" });

export default async function AutopilotDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ created?: string }> }) {
  const { principal, organizationId } = await requirePermission("autopilot:read");
  const { id } = await params;
  const { created } = await searchParams;
  const { autopilot: a, runs } = await getAutopilot(principal, id);
  const canWrite = can(principal, "autopilot:write");
  const canApprove = can(principal, "post:schedule");
  const reqs = a.enabled ? [] : await requirements(organizationId, AUTOPILOT_NEEDS, { brandId: a.brandId });

  return (
    <>
      <Link href="/app/autopilot" className="mb-3 inline-flex text-sm text-muted hover:text-ink">All Autopilots</Link>
      <PageHeader
        title={a.name}
        subtitle={`${a.brandName} · ${a.scheduleText}`}
        actions={<Badge tone={a.enabled ? "success" : "neutral"}>{a.enabled ? "On" : a.pausedReason ? "Paused" : "Off"}</Badge>}
      />
      {created && (
        <Notice tone="success" title="Autopilot is on">
          {a.nextRunAt ? `The first post is made on ${dateTime.format(new Date(a.nextRunAt))}. ` : ""}
          {a.mode === "AUTO_POST" ? "It will post by itself." : "You will be asked to approve it first."} Want to see one right away? Press “Make one now”.
        </Notice>
      )}
      <div className="mb-6">
        <AutopilotControls id={a.id} enabled={a.enabled} mode={a.mode} pausedReason={a.pausedReason} canEdit={canWrite} />
      </div>
      {!a.enabled && reqs.some((r) => !r.ok) && <RequirementsGate requirements={reqs} title="Before it can be switched on" />}

      <dl className="card mb-8 grid max-w-2xl gap-x-4 gap-y-2 p-4 text-sm sm:grid-cols-[9rem_1fr]">
        <dt className="text-muted">Makes</dt><dd className="text-ink">{a.contentKind === "IMAGE" ? "Pictures" : `${a.seconds}-second videos`}, {a.aspectRatio}</dd>
        <dt className="text-muted">Then</dt><dd className="text-ink">{a.mode === "AUTO_POST" ? "Posts automatically" : "Waits for your approval"}</dd>
        <dt className="text-muted">Next post</dt><dd className="text-ink">{a.enabled && a.nextRunAt ? dateTime.format(new Date(a.nextRunAt)) : "Not scheduled"}</dd>
        {a.monthlyCreditCap !== null && (<><dt className="text-muted">Monthly limit</dt><dd className="text-ink">{a.monthlyCreditCap} credits</dd></>)}
        {a.guidance && (<><dt className="text-muted">Keep in mind</dt><dd className="text-ink">{a.guidance}</dd></>)}
      </dl>

      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-primary">History</h2>
      {runs.length === 0 ? (
        <EmptyState title="Nothing made yet">The first post appears here after the next scheduled time, or press “Make one now”.</EmptyState>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {runs.map((r) => (
            <RunCard key={r.id} run={r} canApprove={canApprove} />
          ))}
        </div>
      )}
    </>
  );
}