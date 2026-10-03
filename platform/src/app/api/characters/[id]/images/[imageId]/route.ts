import { handler } from "@/lib/api";
import { removeCharacterImage } from "@/server/characters";

export const dynamic = "force-dynamic";

export const DELETE = handler<{ id: string; imageId: string }>({ permission: "character:write" }, async ({ principal, request, params }) => {
  await removeCharacterImage(principal, params.id, params.imageId, request);
  return { deleted: true };
});
