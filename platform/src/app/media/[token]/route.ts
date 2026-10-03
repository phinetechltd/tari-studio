import { NextResponse } from "next/server";

import { handler } from "@/lib/api";
import { db } from "@/lib/db";
import { verifyMediaToken } from "@/server/media-links";
import { serveFile } from "@/server/storage";

export const dynamic = "force-dynamic";

/**
 * A signed, expiring link to one generated image or video, for Facebook and
 * Instagram to fetch when a post is published (src/server/media-links.ts).
 */
export const GET = handler<{ token: string }>({ public: true }, async ({ params, request }) => {
  const assetId = verifyMediaToken(params.token);
  if (!assetId) return new NextResponse("Not found", { status: 404 });
  const asset = await db.generatedAsset.findFirst({
    where: { id: assetId, status: "READY", archivedAt: null },
    select: { storageKey: true },
  });
  if (!asset?.storageKey) return new NextResponse("Not found", { status: 404 });
  const response = await serveFile(asset.storageKey, request);
  response.headers.set("Cache-Control", "public, max-age=3600");
  return response;
});
