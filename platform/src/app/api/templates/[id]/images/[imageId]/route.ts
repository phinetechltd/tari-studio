import { handler } from "@/lib/api";
import { removeTemplateImage } from "@/server/templates";

export const dynamic = "force-dynamic";

export const DELETE = handler<{ id: string; imageId: string }>({ permission: "template:write" }, async ({ principal, request, params }) => {
  await removeTemplateImage(principal, params.id, params.imageId, request);
  return { deleted: true };
});
