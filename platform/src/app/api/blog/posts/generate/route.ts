import { handler, parseBody } from "@/lib/api";
import { GenerateBody } from "@/lib/blog";
import { db } from "@/lib/db";
import { generateBlogDraft } from "@/server/blog";

/**
 * Draft a post with AI. Uses the shared metered AI path (`ai:generate`, the
 * AI_CONTENT licence and the org's monthly allowance all apply), so an
 * organisation on its own key writes on its own model.
 * The result is a draft only; nothing is saved until the editor does.
 */
export const POST = handler({ permission: "ai:generate" }, async ({ principal, request }) => {
  const input = await parseBody(request, GenerateBody);
  const [category, brand] = await Promise.all([
    input.categoryId
      ? db.blogCategory.findFirst({ where: { id: input.categoryId, organizationId: principal.organizationId! }, select: { name: true } })
      : null,
    input.brandId
      ? db.brand.findFirst({ where: { id: input.brandId, organizationId: principal.organizationId! }, select: { name: true } })
      : null,
  ]);
  const draft = await generateBlogDraft(principal, {
    topic: input.topic,
    tone: input.tone,
    keywords: input.keywords,
    categoryName: category?.name,
    brandName: brand?.name,
  });
  return { draft };
});
