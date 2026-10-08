import { handler, parseBody } from "@/lib/api";
import { CategoryBody } from "@/lib/blog";
import { deleteCategory, updateCategory } from "@/server/blog";

export const PATCH = handler<{ id: string }>({ permission: "blog:write" }, async ({ principal, params, request }) => {
  const input = await parseBody(request, CategoryBody);
  return { category: await updateCategory(principal, params.id, input, request) };
});

/** Posts in the category keep going without it (the FK is ON DELETE SET NULL). */
export const DELETE = handler<{ id: string }>({ permission: "blog:write" }, async ({ principal, params, request }) => {
  await deleteCategory(principal, params.id, request);
  return { deleted: true };
});
