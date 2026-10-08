import type { Metadata } from "next";

import { AssistantEditor } from "@/components/platform/assistant-editor";
import { Notice, PageHeader } from "@/components/ui";
import { requirePlatform } from "@/lib/session";
import { assistantConfigStatus } from "@/server/assistant-config";

export const metadata: Metadata = { title: "Assistant" };
export const dynamic = "force-dynamic";

/** Platform admin → Assistant: what the assistant is called, which models answer, quotas and tools. */
export default async function PlatformAssistantPage() {
  const { principal } = await requirePlatform();
  const status = await assistantConfigStatus();

  return (
    <>
      <PageHeader title="Assistant" subtitle="The helper everyone sees in the console: its name, its models per tier, daily quotas and which tools are switched on." />
      {!principal.mfa ? (
        <Notice tone="warning" title="Two-factor sign-in is needed to save">
          Turn on two-factor authentication under Security before changing the assistant.
        </Notice>
      ) : null}
      <div className="mt-4">
        <AssistantEditor initial={status} />
      </div>
    </>
  );
}
