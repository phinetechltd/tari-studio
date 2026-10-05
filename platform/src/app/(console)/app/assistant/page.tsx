import type { Metadata } from "next";

import { AssistantPanel } from "@/components/assistant/assistant-panel";
import { PageHeader, Notice } from "@/components/ui";
import { requirePermission } from "@/lib/session";
import { tierFor } from "@/server/assistant-config";
import { getAssistantConfig } from "@/server/assistant-config";
import { listThreads } from "@/server/assistant";

export const metadata: Metadata = { title: "Assistant" };
export const dynamic = "force-dynamic";

/** The in-app assistant: fills in brands, creates characters, templates and products, and prepares prompts. */
export default async function AssistantPage() {
  const { principal, organizationId } = await requirePermission("assistant:use");
  const config = await getAssistantConfig();

  if (!config.enabled) {
    return (
      <>
        <PageHeader title="Assistant" subtitle="Your team's helper for brands, characters, templates and prompts" />
        <Notice tone="info" title="The assistant is switched off">
          A platform admin has turned the assistant off for now. Ask your platform team when it will be back.
        </Notice>
      </>
    );
  }

  const [{ tier, reason }, threads] = await Promise.all([tierFor(organizationId), listThreads(organizationId, principal.userId)]);

  return (
    <>
      <PageHeader
        title={config.name}
        subtitle={tier === "paid" ? `Premium assistant (${reason})` : "Standard assistant"}
      />
      <AssistantPanel
        initialThreads={threads}
        assistantName={config.name}
        welcome={config.welcome}
        tier={tier}
        vision={config[tier].vision}
        maxInputChars={config.maxInputChars}
      />
    </>
  );
}
