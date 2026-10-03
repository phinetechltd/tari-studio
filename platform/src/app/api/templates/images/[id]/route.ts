import { fail, handler } from "@/lib/api";
import { serveFile } from "@/server/storage";
import { templateImageFile } from "@/server/templates";

export const dynamic = "force-dynamic";

/** A template's image. Published templates are visible to any signed-in agency member; drafts only to platform admins. */
export const GET = handler<{ id: string }>({ permission: "template:read", allowPlatform: true }, async ({ principal, request, params }) => {
  const key = await templateImageFile(principal, params.id);
  if (!key) return fail(404, "NOT_FOUND", "Image not found.");
  return serveFile(key, request);
});
