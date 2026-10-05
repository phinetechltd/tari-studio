import "server-only";

import { ApiError } from "@/lib/api";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { slugify } from "@/lib/identity";
import type { Principal } from "@/lib/rbac";
import type { Prisma } from "@prisma/client";
import { generateAi } from "@/server/ai";

/**
 * The blog.
 *
 * Every organisation keeps its own posts and categories (console -> Blog); a
 * post moves DRAFT -> PUBLISHED -> ARCHIVED. Only PUBLISHED posts belonging to
 * the operator's organisation (BLOG_ORGANIZATION_SLUG, falling back to
 * ORDERS_ORGANIZATION_SLUG — the same org that owns public orders) appear on
 * the public site, so an agency's drafts never leak onto another tenant.
 */

// ── shared ───────────────────────────────────────────────────────────────

const POST_INCLUDE = {
  category: { select: { id: true, name: true, slug: true } },
  author: { select: { id: true, name: true } },
} as const;

/** The organisation whose published posts the public blog shows. */
async function blogOrganization() {
  const slug = env().BLOG_ORGANIZATION_SLUG?.trim() || env().ORDERS_ORGANIZATION_SLUG;
  const org = await db.organization.findUnique({ where: { slug }, select: { id: true, name: true, status: true } });
  if (!org || org.status !== "ACTIVE") return null;
  return org;
}

async function uniquePostSlug(organizationId: string, title: string, exceptId?: string): Promise<string> {
  const base = slugify(title) || "post";
  for (let i = 0; i < 100; i++) {
    const candidate = i === 0 ? base : `${base}-${i + 1}`;
    const taken = await db.blogPost.findFirst({
      where: { organizationId, slug: candidate, ...(exceptId ? { NOT: { id: exceptId } } : {}) },
      select: { id: true },
    });
    if (!taken) return candidate;
  }
  throw new ApiError(409, "CONFLICT", "That title makes a link that is already taken. Rename the post slightly.");
}

async function uniqueCategorySlug(organizationId: string, name: string, exceptId?: string): Promise<string> {
  const base = slugify(name) || "category";
  for (let i = 0; i < 100; i++) {
    const candidate = i === 0 ? base : `${base}-${i + 1}`;
    const taken = await db.blogCategory.findFirst({
      where: { organizationId, slug: candidate, ...(exceptId ? { NOT: { id: exceptId } } : {}) },
      select: { id: true },
    });
    if (!taken) return candidate;
  }
  throw new ApiError(409, "CONFLICT", "That name makes a link that is already taken. Rename the category slightly.");
}

/** A category id is only honoured when it belongs to the caller's organisation. */
async function ownCategory(organizationId: string, categoryId: string | null | undefined) {
  if (!categoryId) return null;
  const category = await db.blogCategory.findFirst({ where: { id: categoryId, organizationId }, select: { id: true } });
  if (!category) throw new ApiError(400, "BAD_REFERENCE", "That category does not exist in this team.");
  return category.id;
}

function assertSeoUrl(value: string | null | undefined, field: string) {
  if (!value) return;
  if (!/^https:\/\//i.test(value)) {
    throw new ApiError(422, "VALIDATION_FAILED", `${field} must be a full https link, e.g. https://example.com/page.`, {
      issues: [{ path: [field], message: "Use a full https link." }],
    });
  }
}

// ── console: posts ───────────────────────────────────────────────────────

export interface PostFilters {
  status?: string;
  categoryId?: string;
  q?: string;
}

export async function listPosts(principal: Principal, filters: PostFilters = {}) {
  return db.blogPost.findMany({
    where: {
      organizationId: principal.organizationId!,
      ...(filters.status ? { status: filters.status } : { status: { not: "ARCHIVED" } }),
      ...(filters.categoryId ? { categoryId: filters.categoryId } : {}),
      ...(filters.q
        ? {
            OR: [
              { title: { contains: filters.q, mode: "insensitive" as const } },
              { excerpt: { contains: filters.q, mode: "insensitive" as const } },
            ],
          }
        : {}),
    },
    orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
    include: POST_INCLUDE,
    take: 200,
  });
}

export async function getPost(principal: Principal, id: string) {
  const post = await db.blogPost.findUnique({ where: { id }, include: POST_INCLUDE });
  if (!post || post.organizationId !== principal.organizationId) throw new ApiError(404, "NOT_FOUND", "Post not found.");
  return post;
}

export interface PostInput {
  title: string;
  slug?: string;
  excerpt?: string;
  body?: string;
  coverImageUrl?: string | null;
  categoryId?: string | null;
  seoTitle?: string;
  seoDescription?: string;
  seoKeywords?: string[];
  ogImageUrl?: string | null;
  canonicalUrl?: string | null;
  noindex?: boolean;
  status?: string;
  aiMetadata?: Record<string, unknown>;
}

function cleanText(value: string | null | undefined, max: number): string | null {
  const v = value?.trim();
  if (!v) return null;
  return v.slice(0, max);
}

async function postData(organizationId: string, input: PostInput, existingId?: string) {
  const title = input.title.trim();
  if (title.length < 2) throw new ApiError(422, "VALIDATION_FAILED", "Enter the post title.", { issues: [{ path: ["title"], message: "Enter the post title." }] });
  assertSeoUrl(input.canonicalUrl, "canonicalUrl");
  if (input.ogImageUrl) assertSeoUrl(input.ogImageUrl, "ogImageUrl");
  if (input.coverImageUrl && !/^(https:\/\/|\/)/i.test(input.coverImageUrl)) {
    throw new ApiError(422, "VALIDATION_FAILED", "The cover image must be an https link or a site path.", {
      issues: [{ path: ["coverImageUrl"], message: "Use a full https link or a site path." }],
    });
  }
  // A create fills every column (blanks as defaults); an update touches only the fields that were sent.
  const partial = existingId !== undefined;
  const keep = <T>(sent: boolean, value: T) => (sent ? value : undefined);
  return {
    title,
    excerpt: keep(input.excerpt !== undefined, cleanText(input.excerpt, 400)),
    body: input.body ?? (partial ? undefined : ""),
    coverImageUrl: keep(input.coverImageUrl !== undefined, cleanText(input.coverImageUrl, 500)),
    categoryId: keep(input.categoryId !== undefined, await ownCategory(organizationId, input.categoryId)),
    seoTitle: keep(input.seoTitle !== undefined, cleanText(input.seoTitle, 200)),
    seoDescription: keep(input.seoDescription !== undefined, cleanText(input.seoDescription, 320)),
    seoKeywords: keep(input.seoKeywords !== undefined, (input.seoKeywords ?? []).map((k) => k.trim().slice(0, 60)).filter(Boolean).slice(0, 12)),
    ogImageUrl: keep(input.ogImageUrl !== undefined, cleanText(input.ogImageUrl, 500)),
    canonicalUrl: keep(input.canonicalUrl !== undefined, cleanText(input.canonicalUrl, 500)),
    noindex: keep(input.noindex !== undefined, input.noindex ?? false),
  };
}

export async function createPost(principal: Principal, input: PostInput, request?: Request) {
  const organizationId = principal.organizationId!;
  const data = await postData(organizationId, input);
  const publish = input.status === "PUBLISHED";
  const post = await db.blogPost.create({
    data: {
      ...data,
      slug: input.slug?.trim() ? await uniquePostSlug(organizationId, input.slug) : await uniquePostSlug(organizationId, data.title),
      organizationId,
      authorId: principal.userId,
      status: publish ? "PUBLISHED" : "DRAFT",
      publishedAt: publish ? new Date() : null,
      aiMetadata: (input.aiMetadata as Prisma.InputJsonValue) ?? undefined,
    },
    include: POST_INCLUDE,
  });
  await audit({
    organizationId: principal.organizationId,
    userId: principal.userId,
    action: "CREATE",
    entity: "BlogPost",
    entityId: post.id,
    changes: { title: post.title, status: post.status },
    request,
  });
  return post;
}

export async function updatePost(principal: Principal, id: string, input: PostInput, request?: Request) {
  const existing = await db.blogPost.findUnique({ where: { id }, select: { id: true, organizationId: true, status: true, publishedAt: true } });
  if (!existing || existing.organizationId !== principal.organizationId) throw new ApiError(404, "NOT_FOUND", "Post not found.");

  const data = await postData(principal.organizationId!, input, id);
  const status = input.status && ["DRAFT", "PUBLISHED", "ARCHIVED"].includes(input.status) ? input.status : existing.status;
  const post = await db.blogPost.update({
    where: { id },
    data: {
      ...data,
      slug: input.slug?.trim() ? await uniquePostSlug(principal.organizationId!, input.slug, id) : undefined,
      status,
      publishedAt: status === "PUBLISHED" ? (existing.publishedAt ?? new Date()) : status === "DRAFT" ? null : existing.publishedAt,
    },
    include: POST_INCLUDE,
  });
  await audit({
    organizationId: principal.organizationId,
    userId: principal.userId,
    action: "UPDATE",
    entity: "BlogPost",
    entityId: id,
    changes: { title: post.title, from: existing.status, to: post.status },
    request,
  });
  return post;
}

/** Publish / unpublish / archive with one call from the list. */
export async function setPostStatus(principal: Principal, id: string, status: "DRAFT" | "PUBLISHED" | "ARCHIVED", request?: Request) {
  const existing = await db.blogPost.findUnique({ where: { id }, select: { id: true, organizationId: true, status: true, publishedAt: true } });
  if (!existing || existing.organizationId !== principal.organizationId) throw new ApiError(404, "NOT_FOUND", "Post not found.");
  const post = await db.blogPost.update({
    where: { id },
    data: {
      status,
      publishedAt: status === "PUBLISHED" ? (existing.publishedAt ?? new Date()) : status === "DRAFT" ? null : existing.publishedAt,
    },
    include: POST_INCLUDE,
  });
  await audit({
    organizationId: principal.organizationId,
    userId: principal.userId,
    action: "UPDATE",
    entity: "BlogPost",
    entityId: id,
    changes: { from: existing.status, to: status },
    request,
  });
  return post;
}

export async function deletePost(principal: Principal, id: string, request?: Request) {
  const existing = await db.blogPost.findUnique({ where: { id }, select: { id: true, organizationId: true, title: true, status: true } });
  if (!existing || existing.organizationId !== principal.organizationId) throw new ApiError(404, "NOT_FOUND", "Post not found.");
  if (existing.status === "PUBLISHED") {
    throw new ApiError(409, "CONFLICT", "Unpublish the post first, so it leaves the public site before it is deleted.");
  }
  await db.blogPost.delete({ where: { id } });
  await audit({
    organizationId: principal.organizationId,
    userId: principal.userId,
    action: "DELETE",
    entity: "BlogPost",
    entityId: id,
    changes: { title: existing.title, status: existing.status },
    request,
  });
}

// ── console: categories ──────────────────────────────────────────────────

export async function listCategories(principal: Principal) {
  return db.blogCategory.findMany({
    where: { organizationId: principal.organizationId! },
    orderBy: { name: "asc" },
    include: { _count: { select: { posts: true } } },
  });
}

export async function createCategory(principal: Principal, input: { name: string; description?: string }, request?: Request) {
  const name = input.name.trim();
  if (name.length < 2) throw new ApiError(422, "VALIDATION_FAILED", "Enter the category name.");
  const category = await db.blogCategory.create({
    data: {
      organizationId: principal.organizationId!,
      name: name.slice(0, 80),
      slug: await uniqueCategorySlug(principal.organizationId!, name),
      description: cleanText(input.description, 300),
    },
    include: { _count: { select: { posts: true } } },
  });
  await audit({ organizationId: principal.organizationId, userId: principal.userId, action: "CREATE", entity: "BlogCategory", entityId: category.id, changes: { name }, request });
  return category;
}

export async function updateCategory(principal: Principal, id: string, input: { name: string; description?: string }, request?: Request) {
  const existing = await db.blogCategory.findUnique({ where: { id }, select: { id: true, organizationId: true, name: true } });
  if (!existing || existing.organizationId !== principal.organizationId) throw new ApiError(404, "NOT_FOUND", "Category not found.");
  const name = input.name.trim();
  if (name.length < 2) throw new ApiError(422, "VALIDATION_FAILED", "Enter the category name.");
  const category = await db.blogCategory.update({
    where: { id },
    data: {
      name: name.slice(0, 80),
      slug: name === existing.name ? undefined : await uniqueCategorySlug(principal.organizationId!, name, id),
      description: cleanText(input.description, 300),
    },
    include: { _count: { select: { posts: true } } },
  });
  await audit({ organizationId: principal.organizationId, userId: principal.userId, action: "UPDATE", entity: "BlogCategory", entityId: id, changes: { from: existing.name, to: name }, request });
  return category;
}

export async function deleteCategory(principal: Principal, id: string, request?: Request) {
  const existing = await db.blogCategory.findUnique({ where: { id }, select: { id: true, organizationId: true, name: true } });
  if (!existing || existing.organizationId !== principal.organizationId) throw new ApiError(404, "NOT_FOUND", "Category not found.");
  // Posts keep going, simply without the category (the FK is ON DELETE SET NULL).
  await db.blogCategory.delete({ where: { id } });
  await audit({ organizationId: principal.organizationId, userId: principal.userId, action: "DELETE", entity: "BlogCategory", entityId: id, changes: { name: existing.name }, request });
}

// ── AI drafting ─────────────────────────────────────────────────────────

export interface BlogDraft {
  title: string;
  excerpt: string;
  body: string;
  seoTitle: string;
  seoDescription: string;
  seoKeywords: string[];
  model: string;
  requestId: string;
}

/**
 * Drafts a whole post with the organisation's configured AI (the same metered
 * path as captions and the assistant). The model answers with JSON; anything
 * unusable is a 422, never a half-saved post.
 */
export async function generateBlogDraft(
  principal: Principal,
  input: { topic: string; tone?: string; keywords?: string[]; categoryName?: string; brandName?: string },
): Promise<BlogDraft> {
  const topic = input.topic.trim();
  if (topic.length < 4) throw new ApiError(422, "VALIDATION_FAILED", "Describe the post in a few words first.");
  const result = await generateAi(
    [
      `Write a blog post for${input.brandName ? ` ${input.brandName}` : " our agency's"} blog.`,
      `Topic: ${topic}`,
      input.categoryName ? `Category: ${input.categoryName}` : "",
      input.tone ? `Tone of voice: ${input.tone}` : "Tone: helpful, confident, plain language.",
      input.keywords?.length ? `Work these search phrases in naturally: ${input.keywords.join(", ")}.` : "",
      "",
      "Answer with ONLY a JSON object, no markdown fences, shaped exactly:",
      '{ "title": "...", "excerpt": "1-2 sentence standfirst, under 160 characters", "body": "the article in Markdown, 600-900 words, with ## section headings and short paragraphs", "seoTitle": "under 60 characters", "seoDescription": "under 160 characters", "seoKeywords": ["3 to 6 short phrases"] }',
      "The post must teach something concrete. No clickbait, no filler, no placeholders.",
    ].join("\n"),
    { maxTokens: 6000, feature: "blog_post" },
    principal,
  );

  const json = result.text.replace(/^```(?:json)?|```$/g, "").trim();
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(json) as Record<string, unknown>;
  } catch {
    throw new ApiError(422, "AI_REFUSED", "The model did not return a usable draft. Try a more specific topic.");
  }
  const str = (key: string, max: number) => (typeof parsed[key] === "string" ? (parsed[key] as string).trim().slice(0, max) : "");
  const title = str("title", 300);
  const body = str("body", 40000);
  if (!title || !body) throw new ApiError(422, "AI_REFUSED", "The model did not return a usable draft. Try a more specific topic.");
  return {
    title,
    excerpt: str("excerpt", 400),
    body,
    seoTitle: str("seoTitle", 200) || title,
    seoDescription: str("seoDescription", 320),
    seoKeywords: Array.isArray(parsed.seoKeywords) ? parsed.seoKeywords.filter((k): k is string => typeof k === "string").slice(0, 12) : [],
    model: result.model,
    requestId: result.requestId,
  };
}

// ── public site ─────────────────────────────────────────────────────────

export const PUBLIC_POST_SELECT = {
  id: true,
  title: true,
  slug: true,
  excerpt: true,
  body: true,
  coverImageUrl: true,
  status: true,
  publishedAt: true,
  updatedAt: true,
  seoTitle: true,
  seoDescription: true,
  seoKeywords: true,
  ogImageUrl: true,
  canonicalUrl: true,
  noindex: true,
  category: { select: { name: true, slug: true } },
  author: { select: { name: true } },
} as const;

const PAGE_SIZE = 12;

export type PublicPost = Prisma.BlogPostGetPayload<{ select: typeof PUBLIC_POST_SELECT }>;

/** Published posts of the operator's organisation, newest first. Empty when no blog org is configured. */
export async function listPublicPosts(options: { category?: string; q?: string; page?: number } = {}) {
  const org = await blogOrganization();
  if (!org) return { org: null as null, posts: [] as PublicPost[], page: 1, pages: 1, total: 0 };
  const where = {
    organizationId: org.id,
    status: "PUBLISHED",
    noindex: false,
    ...(options.category ? { category: { slug: options.category } } : {}),
    ...(options.q ? { OR: [{ title: { contains: options.q, mode: "insensitive" as const } }, { excerpt: { contains: options.q, mode: "insensitive" as const } }] } : {}),
  };
  const page = Math.max(1, options.page ?? 1);
  const [posts, total] = await Promise.all([
    db.blogPost.findMany({
      where,
      orderBy: { publishedAt: "desc" },
      select: PUBLIC_POST_SELECT,
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    db.blogPost.count({ where }),
  ]);
  return { org, posts, page, pages: Math.max(1, Math.ceil(total / PAGE_SIZE)), total };
}

export async function getPublicPost(slug: string) {
  const org = await blogOrganization();
  if (!org) return { org: null as null, post: null };
  const post = await db.blogPost.findFirst({
    where: { organizationId: org.id, slug, status: "PUBLISHED" },
    select: PUBLIC_POST_SELECT,
  });
  return { org, post };
}

export async function listPublicCategories() {
  const org = await blogOrganization();
  if (!org) return { org: null as null, categories: [] };
  const categories = await db.blogCategory.findMany({
    where: { organizationId: org.id, posts: { some: { status: "PUBLISHED", noindex: false } } },
    orderBy: { name: "asc" },
    select: { id: true, name: true, slug: true, description: true, _count: { select: { posts: { where: { status: "PUBLISHED", noindex: false } } } } },
  });
  return { org, categories };
}

/** Every published, indexable post, for the sitemap. */
export async function sitemapPosts() {
  const org = await blogOrganization();
  if (!org) return [];
  return db.blogPost.findMany({
    where: { organizationId: org.id, status: "PUBLISHED", noindex: false },
    orderBy: { publishedAt: "desc" },
    select: { slug: true, updatedAt: true },
    take: 2000,
  });
}
