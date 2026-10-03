import type { Metadata } from "next";
import { Suspense } from "react";

import { Hint } from "@/components/hints/hint";
import { InboxApp, type ConversationDetail, type ConversationRow } from "@/components/inbox/inbox-app";
import { PageHeader } from "@/components/ui";
import { ApiError } from "@/lib/api";
import { insideServiceWindow } from "@/lib/automation-rules";
import { db } from "@/lib/db";
import { can } from "@/lib/rbac";
import { requirePermission } from "@/lib/session";
import { isSimulated } from "@/server/meta";
import { getConversation, listConversations, markConversationRead } from "@/server/whatsapp";

export const metadata: Metadata = { title: "Inbox" };
export const dynamic = "force-dynamic";

export default async function InboxPage({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  const { principal, organizationId } = await requirePermission("inbox:read");
  const { c } = await searchParams;

  const [conversations, channels] = await Promise.all([
    listConversations(principal, { status: "OPEN" }),
    db.socialChannel.findMany({
      where: { organizationId, platform: "WHATSAPP", status: { not: "DISCONNECTED" } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  let initialDetail: { conversation: ConversationDetail; canReply: boolean } | null = null;
  if (c) {
    try {
      const conversation = await getConversation(principal, c);
      await markConversationRead(principal, c);
      initialDetail = { conversation: conversation as unknown as ConversationDetail, canReply: insideServiceWindow(conversation.lastInboundAt) };
    } catch (e) {
      if (!(e instanceof ApiError)) throw e;
    }
  }

  return (
    <>
      <PageHeader title="Inbox" subtitle="Every WhatsApp conversation across your numbers, with the campaign that started it." />
      <Hint id="inbox.intro" title="WhatsApp, in one inbox">
        Customer messages arrive here once WhatsApp is connected. Reply yourself, or let an automation draft the answer for you to check.
      </Hint>
      <Suspense>
        <InboxApp
          initialConversations={conversations as unknown as ConversationRow[]}
          initialDetail={initialDetail}
          whatsappChannels={channels}
          simulator={isSimulated()}
          canReply={can(principal, "inbox:reply")}
          canEditLead={can(principal, "lead:write")}
          canUseAi={can(principal, "ai:generate")}
        />
      </Suspense>
    </>
  );
}
