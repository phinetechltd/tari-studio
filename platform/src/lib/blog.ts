import { z } from "zod";

/**
 * Shared blog contracts: the zod bodies the API validates with and the shapes
 * the console editor posts. Client-safe — no server imports belong here.
 */

export const BLOG_STATUS = ["DRAFT", "PUBLISHED", "ARCHIVED"] as const;
export type BlogStatus = (typeof BLOG_STATUS)[number];

export const PostBody = z.object({
  title: z.string().trim().min(2, "Enter the post title.").max(300),
  slug: z.string().trim().max(120).optional(),
  excerpt: z.string().max(400).optional(),
  body: z.string().max(60000).optional(),
  coverImageUrl: z.union([z.string().max(500), z.null()]).optional(),
  categoryId: z.union([z.string(), z.null()]).optional(),
  seoTitle: z.string().max(200).optional(),
  seoDescription: z.string().max(320).optional(),
  seoKeywords: z.array(z.string().max(60)).max(12).optional(),
  ogImageUrl: z.union([z.string().max(500), z.null()]).optional(),
  canonicalUrl: z.union([z.string().max(500), z.null()]).optional(),
  noindex: z.boolean().optional(),
  status: z.enum(BLOG_STATUS).optional(),
  aiMetadata: z.record(z.string(), z.unknown()).optional(),
});

export type PostBodyInput = z.input<typeof PostBody>;

export const CategoryBody = z.object({
  name: z.string().trim().min(2, "Enter the category name.").max(80),
  description: z.string().max(300).optional(),
});

export const GenerateBody = z.object({
  topic: z.string().trim().min(4, "Describe the post in a few words.").max(500),
  tone: z.string().trim().max(120).optional(),
  keywords: z.array(z.string().trim().min(1).max(60)).max(12).optional(),
  categoryId: z.string().optional(),
  brandId: z.string().optional(),
});

/** The editor's form state; strings everywhere, converted at save time. */
export interface BlogFormValues {
  id?: string;
  title: string;
  slug: string;
  excerpt: string;
  body: string;
  coverImageUrl: string;
  categoryId: string;
  /** Comma-separated in the form, an array in the API body. */
  seoKeywords: string;
  seoTitle: string;
  seoDescription: string;
  ogImageUrl: string;
  canonicalUrl: string;
  noindex: boolean;
  status: BlogStatus;
}

export function keywordsToArray(text: string): string[] {
  return text
    .split(/[,\n]/)
    .map((k) => k.trim())
    .filter(Boolean)
    .slice(0, 12);
}

export const emptyBlogForm: BlogFormValues = {
  title: "",
  slug: "",
  excerpt: "",
  body: "",
  coverImageUrl: "",
  categoryId: "",
  seoKeywords: "",
  seoTitle: "",
  seoDescription: "",
  ogImageUrl: "",
  canonicalUrl: "",
  noindex: false,
  status: "DRAFT",
};
