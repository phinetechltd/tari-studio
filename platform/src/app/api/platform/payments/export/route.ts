import { NextResponse } from "next/server";

import { handler } from "@/lib/api";
import { paymentsCsv } from "@/server/platform-admin";

export const dynamic = "force-dynamic";

/** Every payment matching the Payments page's filters, as CSV (up to 10,000 rows). */
export const GET = handler({ permission: "platform:manage", allowPlatform: true }, async ({ searchParams }) => {
  const csv = await paymentsCsv({
    status: searchParams.get("status") ?? undefined,
    purpose: searchParams.get("purpose") ?? undefined,
    method: searchParams.get("method") ?? undefined,
    org: searchParams.get("org") ?? undefined,
    q: searchParams.get("q") ?? undefined,
    from: searchParams.get("from") ?? undefined,
    to: searchParams.get("to") ?? undefined,
  });
  const day = new Date().toISOString().slice(0, 10);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="payments-${day}.csv"`,
      "Cache-Control": "no-store",
    },
  });
});
