import { fail, handler } from "@/lib/api";
import { orderAsset } from "@/server/orders";
import { serveFile } from "@/server/storage";

export const dynamic = "force-dynamic";

/** A delivered file of a public order, reachable only with the order's token. */
export const GET = handler<{ token: string; assetId: string }>({ public: true }, async ({ request, params, searchParams }) => {
  const asset = await orderAsset(params.token, params.assetId);
  if (!asset?.storageKey) return fail(404, "NOT_FOUND", "File not found.");
  const ext = asset.storageKey.slice(asset.storageKey.lastIndexOf("."));
  return serveFile(asset.storageKey, request, {
    downloadName: searchParams.get("download") ? `order-${asset.id}${ext}` : undefined,
  });
});
