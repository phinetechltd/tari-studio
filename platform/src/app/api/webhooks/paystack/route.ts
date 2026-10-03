import { fail, handler } from "@/lib/api";
import { env } from "@/lib/env";
import { verifyPaystackSignature } from "@/lib/payments/paystack";
import { intentByReference, settleIntent } from "@/server/payments";

export const dynamic = "force-dynamic";

/**
 * Paystack webhook: register APP_BASE_URL/api/webhooks/paystack in the Paystack
 * dashboard (Settings, API Keys & Webhooks).
 *
 * Every delivery must be signed with the secret key (x-paystack-signature,
 * HMAC-SHA512 of the raw body). Even then the body is only a hint: it names a
 * reference, and settleIntent asks Paystack for the verdict before anything is
 * marked paid. Unknown references and events are acknowledged and ignored, so
 * Paystack stops retrying them.
 */
export const POST = handler({ public: true }, async ({ request }) => {
  const raw = await request.text();
  if (raw.length > 500_000) return fail(413, "TOO_LARGE", "Payload too large.");
  if (!verifyPaystackSignature(raw, request.headers.get("x-paystack-signature"), env().PAYSTACK_SECRET_KEY)) {
    return fail(401, "BAD_SIGNATURE", "Signature check failed.");
  }

  let event: { event?: unknown; data?: { reference?: unknown } };
  try {
    event = JSON.parse(raw);
  } catch {
    return fail(400, "BAD_REQUEST", "Body is not JSON.");
  }

  const reference = typeof event.data?.reference === "string" ? event.data.reference : null;
  if (reference && (event.event === "charge.success" || event.event === "charge.failed")) {
    const intent = await intentByReference(reference);
    if (intent) await settleIntent(intent.id);
  }
  return { received: true };
});
