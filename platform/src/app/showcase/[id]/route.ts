import { NextResponse } from "next/server";

import { handler } from "@/lib/api";
import { db } from "@/lib/db";
import { serveFile } from "@/server/storage";

export const dynamic = "force-dynamic";

/**
 * A generation a platform admin pinned to the landing page. Public by design:
 * only assets with `showcase = true` (and ready, not archived) are served, so
 * un-pinning one takes it off the internet at once.
 */
export const GET = handler<{ id: string }>({ public: true }, async ({ params, request }) => {
  if (!/^[a-z0-9]{10,40}$/i.test(params.id)) return new NextResponse("Not found", { status: 404 });
  const asset = await db.generatedAsset.findFirst({
    where: { id: params.id, showcase: true, status: "READY", archivedAt: null },
    select: { storageKey: true },
  });
  if (!asset?.storageKey) return new NextResponse("Not found", { status: 404 });
  const response = await serveFile(asset.storageKey, request);
  response.headers.set("Cache-Control", "public, max-age=600");
  return response;
});
