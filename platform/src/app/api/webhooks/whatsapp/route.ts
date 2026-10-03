import crypto from "node:crypto";

import { NextResponse } from "next/server";

import { fail, handler } from "@/lib/api";
import { verifyMetaSignature } from "@/lib/meta-signature";
import { processWebhook, webhookSecretsFor, webhookVerifyTokens, type WaWebhook } from "@/server/whatsapp";

export const dynamic = "force-dynamic";

/**
 * WhatsApp Cloud API webhook: register APP_BASE_URL/api/webhooks/whatsapp in the
 * Meta app (the deployment's, or an agency's own app saved in Settings), with
 * the matching verify token, and subscribe to the "messages" field.
 *
 *  GET  — Meta's one-time verification handshake.
 *  POST — messages and delivery receipts, signed with the app secret. A delivery
 *         is processed only when its signature matches the deployment's app or
 *         the own app of the organisation that owns the number it names.
 */

function sameSecret(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

export const GET = handler({ public: true }, async ({ searchParams }) => {
  const expected = await webhookVerifyTokens();
  if (expected.length === 0) return fail(503, "NOT_CONFIGURED", "No webhook verify token is configured.");
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token") ?? "";
  const challenge = searchParams.get("hub.challenge") ?? "";
  if (mode !== "subscribe" || !expected.some((t) => sameSecret(token, t))) return fail(403, "FORBIDDEN", "Verification failed.");
  return new NextResponse(challenge, { status: 200, headers: { "Content-Type": "text/plain" } });
});

export const POST = handler({ public: true }, async ({ request }) => {
  const raw = await request.text();
  if (raw.length > 1_000_000) return fail(413, "TOO_LARGE", "Payload too large.");

  const secrets = await webhookSecretsFor(raw);
  if (secrets.length === 0) return fail(503, "NOT_CONFIGURED", "No Meta app secret is configured, so deliveries cannot be verified.");
  const signature = request.headers.get("x-hub-signature-256");
  if (!secrets.some((s) => verifyMetaSignature(raw, signature, s))) {
    return fail(401, "BAD_SIGNATURE", "Signature does not match.");
  }

  let payload: WaWebhook;
  try {
    payload = JSON.parse(raw) as WaWebhook;
  } catch {
    return fail(400, "BAD_REQUEST", "Body is not JSON.");
  }

  // A 200 tells Meta to stop retrying; an error makes it retry later, which the
  // per-message claim in processWebhook makes safe.
  const outcome = await processWebhook(payload);
  return { received: true, ...outcome };
});
