import { fail, handler } from "@/lib/api";
import { characterImageFile } from "@/server/characters";
import { serveFile } from "@/server/storage";

export const dynamic = "force-dynamic";

/** A character's image, served only to the organisation that owns it. */
export const GET = handler<{ id: string }>({ permission: "character:read" }, async ({ principal, request, params }) => {
  const key = await characterImageFile(principal, params.id);
  if (!key) return fail(404, "NOT_FOUND", "Image not found.");
  return serveFile(key, request);
});
