import { handler } from "@/lib/api";
import { listContacts } from "@/server/whatsapp";

export const GET = handler({ permission: "lead:read" }, async ({ principal, searchParams }) => {
  const contacts = await listContacts(principal, {
    stage: searchParams.get("stage") ?? undefined,
    q: searchParams.get("q") ?? undefined,
  });
  return { contacts };
});
