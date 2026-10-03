import { ApiError, handler } from "@/lib/api";
import { getBudget, saveBudget } from "@/server/ai-credits";

export const dynamic = "force-dynamic";

/** Alert levels for the platform's AI spend. They warn; they never stop customers generating. */
export const GET = handler({ permission: "platform:manage", allowPlatform: true }, async () => getBudget());

export const PUT = handler({ permission: "platform:manage", allowPlatform: true }, async ({ principal, request }) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new ApiError(400, "BAD_REQUEST", "Send the budget as JSON.");
  }
  return saveBudget(principal, body, request);
});
