import type { Metadata } from "next";
import Link from "next/link";

import { AutomationsApp, type AutomationView, type RunView } from "@/components/automations/automations-app";
import { Hint } from "@/components/hints/hint";
import { Notice, PageHeader } from "@/components/ui";
import { db } from "@/lib/db";
import { can } from "@/lib/rbac";
import { requirePermission } from "@/lib/session";
import { listAutomations, recentRuns } from "@/server/automations";

export const metadata: Metadata = { title: "Automations" };
export const dynamic = "force-dynamic";

export default async function AutomationsPage() {
  const { principal, organizationId } = await requirePermission("inbox:read");
  const [automations, runs, brands, whatsappCount] = await Promise.all([
    listAutomations(principal),
    recentRuns(principal),
    db.brand.findMany({ where: { organizationId, status: "ACTIVE" }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.socialChannel.count({ where: { organizationId, platform: "WHATSAPP", status: "ACTIVE" } }),
  ]);

  return (
    <>
      <PageHeader
        title="Automations"
        subtitle="Answer customers the moment they write, move leads along and keep the team informed — without anyone watching the phone."
      />
      <Hint id="automations.intro" title="Let the routine work run itself">
        An automation waits for something (a new message, a keyword, a failed post) and then replies, tags the contact or alerts your team.
      </Hint>
      {whatsappCount === 0 ? (
        <Notice tone="info" title="No WhatsApp number connected yet">
          Message automations start working once a number is connected under{" "}
          <Link href="/app/social/new" className="font-medium underline">
            Social → Connect
          </Link>
          .
        </Notice>
      ) : null}
      <AutomationsApp
        automations={automations as unknown as AutomationView[]}
        runs={runs as unknown as RunView[]}
        brands={brands}
        canEdit={can(principal, "automation:write")}
        aiAvailable={principal.enabledModules.has("AI_CONTENT")}
      />
    </>
  );
}
