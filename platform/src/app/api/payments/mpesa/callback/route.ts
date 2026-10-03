import { NextResponse } from "next/server";

import { handler } from "@/lib/api";
import { db } from "@/lib/db";
import { parseStkCallback } from "@/lib/payments/daraja";
import { settleIntent } from "@/server/payments";

export const dynamic = "force-dynamic";

/**
 * Safaricom's STK callback.
 *
 * Public by necessity (Safaricom has no session) and unsigned (Daraja does not
 * sign callbacks), so the body is never believed: it only says *which* payment
 * to re-check, and `settleIntent` asks Safaricom directly before anything is
 * marked paid. A forged callback can at most trigger a query that says "no".
 *
 * Always answers 200: Daraja retries anything else, and a retry storm for a
 * reference we will never act on helps nobody.
 */
export const POST = handler({ public: true }, async ({ request }) => {
  const raw = await request.text();
  let body: unknown = null;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ ResultCode: 0, ResultDesc: "Ignored" });
  }

  const parsed = parseStkCallback(body);
  if (!parsed) return NextResponse.json({ ResultCode: 0, ResultDesc: "Ignored" });

  const intent = await db.paymentIntent.findFirst({
    where: { provider: "MPESA_DARAJA", providerRef: parsed.checkoutRequestId },
    select: { id: true },
  });
  if (!intent) return NextResponse.json({ ResultCode: 0, ResultDesc: "Ignored" });

  try {
    await settleIntent(intent.id, { receipt: parsed.resultCode === "0" ? parsed.receipt : null });
  } catch (e) {
    console.error("[mpesa-callback] settle failed", e instanceof Error ? e.message : e);
  }
  return NextResponse.json({ ResultCode: 0, ResultDesc: "Accepted" });
});
