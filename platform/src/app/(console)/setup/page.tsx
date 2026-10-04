import type { Metadata } from "next";

import { PageHeader } from "@/components/ui";
import { PRODUCT_NAME } from "@/lib/brand";
import { requirePermission } from "@/lib/session";
import { markWizardSeen, setupProgress } from "@/server/setup";

import { SetupWizard } from "./setup-wizard";

export const metadata: Metadata = { title: "Get started" };
export const dynamic = "force-dynamic";

/** The getting-started wizard for a new workspace. */
export default async function SetupPage() {
  const { principal, organizationId } = await requirePermission("org:write");
  const progress = await setupProgress({ ...principal, organizationId });
  if (!progress.seen && principal.role === "OWNER") await markWizardSeen(organizationId);
  const canEdit = principal.role === "OWNER" || principal.role === "SUPER_ADMIN";

  return (
    <>
      <PageHeader title={`Get started with ${PRODUCT_NAME}`} subtitle="A few steps to a workspace that makes ads, posts them and answers customers. Do them in any order; each ticks itself when it's done." />
      <SetupWizard steps={progress.steps} canEdit={canEdit} dismissed={progress.dismissed} guideOff={progress.guideOff} />
    </>
  );
}
