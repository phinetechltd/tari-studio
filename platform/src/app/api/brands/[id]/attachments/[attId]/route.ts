import { fail, handler } from "@/lib/api";
import { attachmentFile, removeAttachment } from "@/server/brand-profile";
import { serveFile } from "@/server/storage";

export const dynamic = "force-dynamic";

/** Pictures show in the page; documents always download. */
export const GET = handler<{ id: string; attId: string }>({ permission: "brand:read" }, async ({ principal, request, params }) => {
  const a = await attachmentFile(principal, params.id, params.attId);
  if (!a) return fail(404, "NOT_FOUND", "File not found.");
  return serveFile(a.storageKey, request, a.kind === "DOCUMENT" ? { downloadName: a.fileName } : {});
});

export const DELETE = handler<{ id: string; attId: string }>({ permission: "brand:write" }, async ({ principal, params, request }) => {
  await removeAttachment(principal, params.id, params.attId, request);
  return { removed: true };
});