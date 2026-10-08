import { handler, parseBody } from "@/lib/api";
import { PostBody } from "@/lib/blog";
import { createPost, listPosts } from "@/server/blog";

/**
 * Blog management for the tenant console. `blog:write` is a core permission
 * (not module-gated): every agency may keep its own posts; only the operator
 * organisation's PUBLISHED posts appear on the public blog (src/server/blog.ts).
 */

export const GET = handler({ permission: "blog:read" }, async ({ principal, searchParams }) => {
  const posts = await listPosts(principal, {
    status: searchParams.get("status") ?? undefined,
    categoryId: searchParams.get("categoryId") ?? undefined,
    q: searchParams.get("q")?.slice(0, 80) ?? undefined,
  });
  return { posts };
});

export const POST = handler({ permission: "blog:write" }, async ({ principal, request }) => {
  const input = await parseBody(request, PostBody);
  const post = await createPost(principal, input, request);
  return { post };
});
