import { handler } from "@/lib/api";
import { orgIdOf } from "@/lib/tenant";
import { threadDetail } from "@/server/assistant";

export const dynamic = "force-dynamic";

export const GET = handler<{ id: string }>({ permission: "assistant:use" }, async ({ principal, params }) => threadDetail(orgIdOf(principal), principal.userId, params.id));
