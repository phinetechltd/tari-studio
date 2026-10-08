import { ApiError, handler } from "@/lib/api";
import { hit } from "@/lib/ratelimit";
import { orgIdOf } from "@/lib/tenant";
import { accessTokenOf, activeAccount, refreshTokenOf, updateTokens } from "@/server/external-accounts";
import { pinterest, pinterestFeatures, PinterestError } from "@/server/pinterest";

export const dynamic = "force-dynamic";

/**
 * Pins for the picker: `source=own` searches the connected account's pins,
 * `board` lists a board's pins, `partner` searches all of Pinterest (only
 * when the app has partner access).
 */
export const GET = handler({ permission: "template:read" }, async ({ principal, searchParams }) => {
  const limit = await hit(`pinterest-search:${principal.userId}`, { limit: 120, windowSec: 3600 });
  if (!limit.allowed) throw new ApiError(429, "RATE_LIMITED", "Too many Pinterest searches. Try again in a while.");
  const source = searchParams.get("source") ?? "own";
  const q = (searchParams.get("q") ?? "").trim().slice(0, 100);
  const bookmark = searchParams.get("bookmark");
  const account = await activeAccount(orgIdOf(principal), "PINTEREST");
  if (!account) throw new ApiError(409, "PINTEREST_NOT_CONNECTED", "Connect Pinterest first.");
  if (source === "partner" && !pinterestFeatures().partnerSearch) throw new ApiError(403, "FORBIDDEN", "Searching all of Pinterest is not switched on.");

  let token = accessTokenOf(account);
  if (!token || (account.accessExpiresAt && account.accessExpiresAt.getTime() < Date.now() + 60_000)) {
    const refresh = refreshTokenOf(account);
    if (!refresh) throw new ApiError(409, "PINTEREST_NOT_CONNECTED", "The Pinterest sign-in has expired. Connect Pinterest again.");
    const fresh = await pinterest().refresh(refresh);
    await updateTokens(account, { ...fresh, refreshToken: fresh.refreshToken ?? refresh });
    token = fresh.accessToken;
  }
  const username = account.handle ?? account.name;
  try {
    if (source === "board") {
      const boardId = searchParams.get("board") ?? "";
      return pinterest().boardPins({ token, boardId, bookmark, username });
    }
    if (!q) throw new ApiError(422, "VALIDATION_FAILED", "Type something to search for.");
    return source === "partner" ? pinterest().partnerSearch({ token, query: q, bookmark }) : pinterest().searchOwn({ token, query: q, bookmark, username });
  } catch (error) {
    if (error instanceof PinterestError) throw new ApiError(error.status === 401 ? 409 : 502, error.status === 401 ? "PINTEREST_NOT_CONNECTED" : "PINTEREST_ERROR", error.message);
    throw error;
  }
});
