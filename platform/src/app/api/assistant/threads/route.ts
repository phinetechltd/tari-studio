import { handler, ok } from "@/lib/api";
import { orgIdOf } from "@/lib/tenant";
import { createThread, listThreads } from "@/server/assistant";

export const dynamic = "force-dynamic";

/** The person's assistant chats (each chat belongs to one person in one team). */
export const GET = handler({ permission: "assistant:use" }, async ({ principal }) => listThreads(orgIdOf(principal), principal.userId));

export const POST = handler({ permission: "assistant:use" }, async ({ principal }) => ok(await createThread(orgIdOf(principal), principal.userId), undefined, { status: 201 }));
