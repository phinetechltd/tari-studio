import { z } from "zod";

import { handler, parseBody } from "@/lib/api";
import { BLOG_STATUS, PostBody } from "@/lib/blog";
import { deletePost, getPost, setPostStatus, updatePost } from "@/server/blog";

const StatusBody = z.object({ status: z.enum(BLOG_STATUS) });

export const GET = handler<{ id: string }>({ permission: "blog:read" }, async ({ principal, params }) => {
  return { post: await getPost(principal, params.id) };
});

export const PATCH = handler<{ id: string }>({ permission: "blog:write" }, async ({ principal, params, request }) => {
  const raw = await parseBody(request, z.union([PostBody, StatusBody]));
  const post =
    "title" in raw
      ? await updatePost(principal, params.id, raw, request)
      : await setPostStatus(principal, params.id, raw.status, request);
  return { post };
});

/** Hard delete, refused while the post is PUBLISHED: unpublish first so it leaves the public site. */
export const DELETE = handler<{ id: string }>({ permission: "blog:write" }, async ({ principal, params, request }) => {
  await deletePost(principal, params.id, request);
  return { deleted: true };
});
