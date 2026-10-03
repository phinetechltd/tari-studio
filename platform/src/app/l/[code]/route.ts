import { NextResponse } from "next/server";

import { handler } from "@/lib/api";
import { hit } from "@/lib/ratelimit";
import { isShortCode } from "@/lib/tracked-links";
import { recordClick, resolveTrackedLink } from "@/server/campaigns";

export const dynamic = "force-dynamic";

/**
 * A tracked campaign link: APP_BASE_URL/l/<code>. Counts the click (not for
 * link-preview bots or a repeat within minutes) and forwards. Counting never
 * blocks the redirect: a customer who tapped an ad always reaches the offer.
 */
export const GET = handler<{ code: string }>({ public: true }, async ({ params, request }) => {
  const code = params.code.toUpperCase();
  const home = new URL("/", request.url);
  if (!isShortCode(code)) return NextResponse.redirect(home, 302);

  const link = await resolveTrackedLink(code);
  if (!link) return NextResponse.redirect(home, 302);

  try {
    // One busy link cannot fill the click table: past this rate, clicks still
    // redirect but stop being recorded individually.
    const budget = await hit(`link-click:${code}`, { limit: 600, windowSec: 60 });
    if (budget.allowed) await recordClick(link.id, request);
  } catch (error) {
    console.error("[links] click not recorded", error instanceof Error ? error.message : error);
  }

  const response = NextResponse.redirect(link.destination, 302);
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer-when-downgrade");
  return response;
});
