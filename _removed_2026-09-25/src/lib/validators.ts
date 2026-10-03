import { z } from "zod";

export const createAssetSchema = z.object({
  mediaType: z.enum(["IMAGE", "VIDEO"]),
  model: z.string().min(1, "Model is required"),
  prompt: z.string().min(3, "Prompt must be at least 3 characters").max(2000, "Prompt too long"),
  aspectRatio: z.string().optional(),
  seed: z.number().int().min(0).max(999999).optional(),
  duration: z.number().int().min(1).max(30).optional(),
  motion: z.number().int().min(0).max(5).optional(),
  resolution: z.string().optional(),
});

export const createSubmissionSchema = z.object({
  assetId: z.string().optional(),
  taskId: z.string().optional(),
  title: z.string().min(1, "Title is required").max(200),
  description: z.string().max(2000).optional(),
  caption: z.string().max(1000).optional(),
  altText: z.string().max(500).optional(),
  aspectRatio: z.string().optional(),
  status: z.enum(["DRAFT", "IN_REVIEW", "APPROVED", "REJECTED", "SCHEDULED", "PUBLISHED"]).optional(),
});

export const createPostSchema = z.object({
  submissionId: z.string().optional(),
  brandId: z.string().min(1, "Brand is required"),
  channel: z.enum(["FACEBOOK", "INSTAGRAM", "WHATSAPP", "TIKTOK", "LINKEDIN"]),
  externalChannelId: z.string().optional(),
  caption: z.string().min(1, "Caption is required").max(2200),
  mediaUrls: z.array(z.string().url()).optional(),
  altTexts: z.array(z.string()).optional(),
  linkUrl: z.string().url().optional(),
  utmParams: z.record(z.string()).optional(),
  scheduledAt: z.string().datetime().optional(),
});
