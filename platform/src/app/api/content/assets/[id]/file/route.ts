import { fail, handler } from "@/lib/api";
import { db } from "@/lib/db";
import { orgIdOf } from "@/lib/tenant";
import { serveFile } from "@/server/storage";

export const dynamic = "force-dynamic";

/** Streams a generated file (with byte ranges, so videos seek). `?download=1` saves it. */
export const GET = handler<{ id: string }>({ permission: "ai:generate" }, async ({ principal, request, params, searchParams }) => {
  const asset = await db.generatedAsset.findFirst({
    where: { id: params.id, organizationId: orgIdOf(principal), status: "READY" },
    select: { id: true, storageKey: true, mediaType: true },
  });
  if (!asset?.storageKey) return fail(404, "NOT_FOUND", "File not found.");

  const download = searchParams.get("download") === "1";
  if (download) {
    await db.generatedAsset.update({
      where: { id: asset.id },
      data: { downloadCount: { increment: 1 }, lastDownloadedAt: new Date() },
    });
  }
  const ext = asset.storageKey.slice(asset.storageKey.lastIndexOf("."));
  return serveFile(asset.storageKey, request, {
    downloadName: download ? `${asset.mediaType === "VIDEO" ? "video" : "image"}-${asset.id}${ext}` : undefined,
  });
});
