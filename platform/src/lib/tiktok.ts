import { z } from "zod";

/**
 * Pure TikTok helpers: webhook signatures, the posting options TikTok makes
 * every app show, and how a video is cut into upload chunks.
 * Formats from developers.tiktok.com (Content Posting API, Webhooks), Oct 2026.
 */

export const PRIVACY_LEVELS = ["PUBLIC_TO_EVERYONE", "MUTUAL_FOLLOW_FRIENDS", "FOLLOWER_OF_CREATOR", "SELF_ONLY"] as const;
export type PrivacyLevel = (typeof PRIVACY_LEVELS)[number];

export const PRIVACY_LABELS: Record<PrivacyLevel, string> = {
  PUBLIC_TO_EVERYONE: "Everyone",
  MUTUAL_FOLLOW_FRIENDS: "Friends",
  FOLLOWER_OF_CREATOR: "Followers",
  SELF_ONLY: "Only me",
};

/**
 * What a person chooses for each TikTok post. TikTok's rules: the privacy level
 * has no default (the person picks it from the creator's own options), and the
 * interaction switches start off. Our media is AI-made, so posts are labelled
 * as AI-generated content (`is_aigc`).
 */
export const tikTokOptionsSchema = z.object({
  privacyLevel: z.enum(PRIVACY_LEVELS, { errorMap: () => ({ message: "Choose who can see the TikTok post." }) }),
  allowComments: z.boolean().default(false),
  allowDuet: z.boolean().default(false),
  allowStitch: z.boolean().default(false),
  /** Paid partnership or promoting someone else's brand */
  brandedContent: z.boolean().default(false),
  /** Promoting your own business */
  yourBrand: z.boolean().default(false),
});
export type TikTokOptions = z.infer<typeof tikTokOptionsSchema>;

const MB = 1024 * 1024;

/**
 * How TikTok wants a file uploaded: a file up to 64 MB goes in one chunk;
 * larger ones in 10 MB chunks, the last one taking the remainder (TikTok counts
 * chunks as floor(size / chunk size)).
 */
export function chunkPlan(size: number): { chunkSize: number; count: number; ranges: Array<{ start: number; end: number }> } {
  if (!Number.isInteger(size) || size <= 0) throw new Error("The video file is empty.");
  if (size <= 64 * MB) return { chunkSize: size, count: 1, ranges: [{ start: 0, end: size - 1 }] };
  const chunkSize = 10 * MB;
  const count = Math.floor(size / chunkSize);
  const ranges = Array.from({ length: count }, (_, i) => ({ start: i * chunkSize, end: i === count - 1 ? size - 1 : (i + 1) * chunkSize - 1 }));
  return { chunkSize, count, ranges };
}

/** TikTok's publish statuses, in words a person can act on. */
export function describeTikTokFailure(reason: string | null | undefined): string {
  const r = (reason ?? "").toLowerCase();
  if (r.includes("spam")) return "TikTok limited this account for posting too often. Try again later.";
  if (r.includes("duration")) return "The video is longer than this TikTok account may post.";
  if (r.includes("frame_rate") || r.includes("resolution") || r.includes("file_format")) return "TikTok could not use this video's format.";
  if (r.includes("unaudited")) return "This TikTok app has not been audited yet, so it can only post to private accounts or as Only me.";
  if (r.includes("privacy")) return "That privacy option is not available on this TikTok account.";
  return reason ? `TikTok refused the post (${reason}).` : "TikTok refused the post.";
}
