import { handler, parseBody } from "@/lib/api";
import { CategoryBody } from "@/lib/blog";
import { createCategory, listCategories } from "@/server/blog";

export const GET = handler({ permission: "blog:read" }, async ({ principal }) => {
  return { categories: await listCategories(principal) };
});

export const POST = handler({ permission: "blog:write" }, async ({ principal, request }) => {
  const input = await parseBody(request, CategoryBody);
  return { category: await createCategory(principal, input, request) };
});
