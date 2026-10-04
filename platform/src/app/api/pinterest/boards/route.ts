import { ApiError, handler } from "@/lib/api";
import { orgIdOf } from "@/lib/tenant";
import { accessTokenOf, activeAccount } from "@/server/external-accounts";
import { pinterest, PinterestError } from "@/server/pinterest";

export const dynamic = "force-dynamic";

/** The connected account's boards. */
export const GET = handler({ permission: "template:read" }, async ({ principal }) => {
  const account = await activeAccount(orgIdOf(principal), "PINTEREST");
  const token = account ? accessTokenOf(account) : null;
  if (!account || !token) throw new ApiError(409, "PINTEREST_NOT_CONNECTED", "Connect Pinterest first.");
  try {
    return { boards: await pinterest().boards(token) };
  } catch (error) {
    if (error instanceof PinterestError) throw new ApiError(error.status === 401 ? 409 : 502, error.status === 401 ? "PINTEREST_NOT_CONNECTED" : "PINTEREST_ERROR", error.message);
    throw error;
  }
});
