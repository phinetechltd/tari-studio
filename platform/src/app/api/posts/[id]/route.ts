import { z } from "zod";

import { handler, parseBody } from "@/lib/api";
import { cancelPost, retryPost } from "@/server/social";

const Body = z.object({ action: z.enum(["cancel", "retry"]) });

export const PATCH = handler<{ id: string }>({ permission: "post:schedule" }, async ({ principal, params, request }) => {
  const { action } = await parseBody(request, Body);
  if (action === "cancel") await cancelPost(principal, params.id);
  else await retryPost(principal, params.id);
  return { done: action };
});
