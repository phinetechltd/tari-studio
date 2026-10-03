import { handler } from "@/lib/api";
import { listConversations } from "@/server/whatsapp";

export const GET = handler({ permission: "inbox:read" }, async ({ principal, searchParams }) => {
  const conversations = await listConversations(principal, {
    status: searchParams.get("status") ?? undefined,
    q: searchParams.get("q") ?? undefined,
  });
  return { conversations };
});
