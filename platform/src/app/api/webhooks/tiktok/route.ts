import { fail, handler } from "@/lib/api";
import { env } from "@/lib/env";
import { verifyTikTokSignature } from "@/lib/tiktok-signature";
import { handleTikTokWebhook } from "@/server/tiktok-posting";

export const dynamic = "force-dynamic";

/**
 * TikTok webhooks: register APP_BASE_URL/api/webhooks/tiktok in the TikTok
 * developer portal. Every delivery must carry a valid TikTok-Signature
 * (HMAC-SHA256 with the client secret) from the last five minutes. Publish
 * events only trigger a status check; deauthorisation disconnects the account.
 */
export const POST = handler({ public: true }, async ({ request }) => {
  const raw = await request.text();
  if (raw.length > 200_000) return fail(413, "TOO_LARGE", "Payload too large.");
  if (!verifyTikTokSignature(request.headers.get("tiktok-signature"), raw, env().TIKTOK_CLIENT_SECRET ?? "")) {
    return fail(401, "BAD_SIGNATURE", "Signature check failed.");
  }
  let event: { event?: string; user_openid?: string; content?: string; client_key?: string };
  try {
    event = JSON.parse(raw);
  } catch {
    return fail(400, "BAD_REQUEST", "Body is not JSON.");
  }
  if (event.client_key && env().TIKTOK_CLIENT_KEY && event.client_key !== env().TIKTOK_CLIENT_KEY) return { ignored: "another app" };
  return { handled: await handleTikTokWebhook(event) };
});
