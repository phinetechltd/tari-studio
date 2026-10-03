import { PricingError, VIDEO_MAX_SECONDS, VIDEO_MIN_SECONDS, type Pricing } from "./pricing";

/**
 * The generation models, in one registry. Endpoint IDs and parameters are from
 * the Higgsfield docs (docs.higgsfield.ai, Sep 2026):
 *
 *   - Soul 2 (images): aspect 9:16, 16:9, 4:3, 3:4, 1:1, 2:3, 3:2; 720p or 1080p.
 *   - Seedance 2.5 (video): 4 to 30 s; 480p or 720p; aspect 16:9, 4:3, 1:1,
 *     3:4, 9:16, 21:9; `generate_audio` defaults on. Image-to-video and extend
 *     take a *public* source URL, so they work from generated media only.
 *
 * The aspect ratios offered are the ones both families accept.
 */

export type GenerationMode = "image" | "video" | "animate" | "extend";
export type MediaType = "IMAGE" | "VIDEO";

export const ASPECT_RATIOS = ["1:1", "9:16", "16:9", "3:4", "4:3"] as const;
export type AspectRatio = (typeof ASPECT_RATIOS)[number];

export interface ModeSpec {
  mode: GenerationMode;
  label: string;
  endpoint: string;
  media: MediaType;
  /** The kind of source asset the mode starts from, if any */
  source: MediaType | null;
  defaultAspect: AspectRatio;
  resolution: string;
}

export const MODES: Record<GenerationMode, ModeSpec> = {
  image: {
    mode: "image",
    label: "Image",
    endpoint: "higgsfield-ai/soul/v2/standard",
    media: "IMAGE",
    source: null,
    defaultAspect: "1:1",
    resolution: "1080p",
  },
  video: {
    mode: "video",
    label: "Video",
    endpoint: "bytedance/seedance-2.5/text-to-video",
    media: "VIDEO",
    source: null,
    defaultAspect: "9:16",
    resolution: "720p",
  },
  animate: {
    mode: "animate",
    label: "Animate image",
    endpoint: "bytedance/seedance-2.5/image-to-video",
    media: "VIDEO",
    source: "IMAGE",
    defaultAspect: "9:16",
    resolution: "720p",
  },
  extend: {
    mode: "extend",
    label: "Extend video",
    endpoint: "bytedance/seedance-2.5/video-extend",
    media: "VIDEO",
    source: "VIDEO",
    defaultAspect: "9:16",
    resolution: "720p",
  },
};

export function isAspectRatio(v: unknown): v is AspectRatio {
  return typeof v === "string" && (ASPECT_RATIOS as readonly string[]).includes(v);
}

export interface InputArgs {
  prompt: string;
  seconds?: number;
  aspectRatio: AspectRatio;
  /** Public URL of the source image (animate) or video (extend) */
  sourceUrl?: string;
}

// ── model families ────────────────────────────────────────────────────────
//
// A platform admin manages the catalogue (AiModel rows); the family says which
// request body a model takes and what it accepts. Formats from docs.higgsfield.ai
// (3 Oct 2026):
//
//   - Kling 3.0 standard: 3 to 15 s; text-to-video takes 16:9, 9:16 or 1:1;
//     `sound` "on" or "off"; image-to-video takes `image_url`.
//   - Hailuo 2.3 standard: 6 or 10 s only, 768p, no aspect ratio and no sound;
//     `prompt_optimizer` defaults on; image-to-video takes `image_url`.

export type ModelFamily = "soul" | "seedance" | "kling" | "hailuo";
export const MODEL_FAMILIES = ["soul", "seedance", "kling", "hailuo"] as const;

export type SecondsRule = { min: number; max: number } | { choices: readonly number[] };

export interface FamilySpec {
  name: string;
  media: MediaType;
  /** The modes the family can serve */
  modes: readonly GenerationMode[];
  /** Video lengths it accepts */
  seconds: SecondsRule | null;
  /** Shapes it accepts for text-to-video and images; null = the model picks */
  aspects: readonly AspectRatio[] | null;
  resolution: string;
  sound: boolean;
}

export const FAMILIES: Record<ModelFamily, FamilySpec> = {
  soul: { name: "Soul", media: "IMAGE", modes: ["image"], seconds: null, aspects: ASPECT_RATIOS, resolution: "1080p", sound: false },
  seedance: {
    name: "Seedance",
    media: "VIDEO",
    modes: ["video", "animate", "extend"],
    seconds: { min: VIDEO_MIN_SECONDS, max: VIDEO_MAX_SECONDS },
    aspects: ASPECT_RATIOS,
    resolution: "720p",
    sound: true,
  },
  kling: {
    name: "Kling",
    media: "VIDEO",
    modes: ["video", "animate"],
    seconds: { min: 3, max: 15 },
    aspects: ["1:1", "9:16", "16:9"],
    resolution: "720p",
    sound: true,
  },
  hailuo: { name: "Hailuo", media: "VIDEO", modes: ["video", "animate"], seconds: { choices: [6, 10] }, aspects: null, resolution: "768p", sound: false },
};

export function isModelFamily(v: unknown): v is ModelFamily {
  return typeof v === "string" && (MODEL_FAMILIES as readonly string[]).includes(v);
}

/** A catalogue entry as the app uses it (an AiModel row, or a built-in fallback). */
export interface CatalogueModel {
  key: string;
  label: string;
  family: ModelFamily;
  media: MediaType;
  endpoints: Partial<Record<GenerationMode, string>>;
  enabled: boolean;
  defaultFor: GenerationMode[];
  /** Customer credits per image; null = the price list's image rate */
  creditsPerImage: number | null;
  /** Customer credits per started step of video; null = the price list's video rate */
  creditsPerStep: number | null;
  providerMilliCreditsHint: number | null;
  description: string | null;
  sortOrder: number;
}

/** What the Studio used before the catalogue existed; also the answer when the table is empty. */
export const BUILT_IN_MODELS: CatalogueModel[] = [
  {
    key: "soul-2",
    label: "Soul 2",
    family: "soul",
    media: "IMAGE",
    endpoints: { image: MODES.image.endpoint },
    enabled: true,
    defaultFor: ["image"],
    creditsPerImage: null,
    creditsPerStep: null,
    providerMilliCreditsHint: null,
    description: "Photoreal stills and posters at 1080p, in any social shape.",
    sortOrder: 10,
  },
  {
    key: "seedance-2.5",
    label: "Seedance 2.5",
    family: "seedance",
    media: "VIDEO",
    endpoints: { video: MODES.video.endpoint, animate: MODES.animate.endpoint, extend: MODES.extend.endpoint },
    enabled: true,
    defaultFor: ["video", "animate", "extend"],
    creditsPerImage: null,
    creditsPerStep: null,
    providerMilliCreditsHint: null,
    description: "4 to 30 seconds at 720p, with sound.",
    sortOrder: 20,
  },
];

/** The lengths a family accepts, in words: "3 to 15 s" or "6 or 10 s". */
export function secondsLabel(rule: SecondsRule | null): string {
  if (!rule) return "";
  if ("choices" in rule) {
    const all = rule.choices.map(String);
    return `${all.length > 1 ? `${all.slice(0, -1).join(", ")} or ` : ""}${all[all.length - 1]} s`;
  }
  return `${rule.min} to ${rule.max} s`;
}

export function secondsAllowed(rule: SecondsRule | null, seconds: number): boolean {
  if (!rule) return true;
  if (!Number.isInteger(seconds)) return false;
  return "choices" in rule ? rule.choices.includes(seconds) : seconds >= rule.min && seconds <= rule.max;
}

/** The nearest length a family accepts (a quote moved to another model keeps roughly its length). */
export function fitSeconds(rule: SecondsRule | null, seconds: number): number {
  if (!rule) return seconds;
  if ("choices" in rule) {
    return [...rule.choices].sort((a, b) => Math.abs(a - seconds) - Math.abs(b - seconds) || a - b)[0]!;
  }
  return Math.min(rule.max, Math.max(rule.min, Math.round(seconds)));
}

/**
 * A quote's length and shape moved onto another model: the nearest length it
 * accepts, and the nearest shape it makes (vertical stays vertical).
 */
export function fitQuote(
  family: ModelFamily,
  mode: GenerationMode,
  seconds: number | null,
  aspectRatio: AspectRatio,
): { seconds: number | null; aspectRatio: AspectRatio } {
  const spec = FAMILIES[family];
  const s = spec.media === "VIDEO" ? fitSeconds(spec.seconds, seconds ?? 10) : null;
  if (MODES[mode].source || !spec.aspects || spec.aspects.includes(aspectRatio)) return { seconds: s, aspectRatio };
  const near: Record<AspectRatio, AspectRatio[]> = {
    "1:1": ["1:1"],
    "9:16": ["9:16", "3:4"],
    "3:4": ["3:4", "9:16"],
    "16:9": ["16:9", "4:3"],
    "4:3": ["4:3", "16:9"],
  };
  const pick = near[aspectRatio].find((a) => spec.aspects!.includes(a)) ?? spec.aspects[0]!;
  return { seconds: s, aspectRatio: pick };
}

function lengthError(rule: SecondsRule | null): string {
  return `Video length must be ${secondsLabel(rule).replace(/ s$/, " seconds")}`;
}

/** The request body for a model family and mode. Throws on a request the model cannot take. */
export function buildModelInput(family: ModelFamily, mode: GenerationMode, args: InputArgs): Record<string, unknown> {
  const spec = FAMILIES[family];
  const prompt = args.prompt.trim();
  if (!prompt) throw new Error("A prompt is required");
  if (!spec.modes.includes(mode)) throw new Error(`${spec.name} models cannot ${MODES[mode].label.toLowerCase()}`);

  if (spec.media === "IMAGE") {
    return { prompt, aspect_ratio: args.aspectRatio, resolution: spec.resolution, enhance_prompt: true, batch_size: 1 };
  }

  const seconds = args.seconds ?? fitSeconds(spec.seconds, 5);
  if (!secondsAllowed(spec.seconds, seconds)) throw new Error(lengthError(spec.seconds));
  const source = MODES[mode].source;
  if (source && !args.sourceUrl) throw new Error(`${MODES[mode].label} needs a source ${source === "IMAGE" ? "image" : "video"}`);
  if (mode === "video" && spec.aspects && !spec.aspects.includes(args.aspectRatio)) {
    throw new Error(`${spec.name} makes ${spec.aspects.join(", ")} videos`);
  }

  if (family === "kling") {
    const common = { prompt, duration: seconds, sound: "on" };
    return mode === "video" ? { ...common, aspect_ratio: args.aspectRatio } : { ...common, image_url: args.sourceUrl };
  }
  if (family === "hailuo") {
    const common = { prompt, duration: seconds, prompt_optimizer: true };
    return mode === "video" ? common : { ...common, image_url: args.sourceUrl };
  }

  const common = { prompt, duration: seconds, resolution: spec.resolution, generate_audio: true, output_format: "mp4" };
  if (mode === "video") return { ...common, aspect_ratio: args.aspectRatio };
  if (mode === "animate") return { ...common, image_url: args.sourceUrl };
  return { ...common, video_url: args.sourceUrl };
}

/** The request body Higgsfield expects for a mode on the built-in models (Soul 2, Seedance 2.5). */
export function buildInput(mode: GenerationMode, args: InputArgs): Record<string, unknown> {
  return buildModelInput(MODES[mode].media === "IMAGE" ? "soul" : "seedance", mode, args);
}

/**
 * Credits a generation costs on a model: its own rate when the admin set one,
 * otherwise the price list's (an image; or per started step of video).
 */
export function modelCredits(
  p: Pricing,
  model: Pick<CatalogueModel, "family" | "creditsPerImage" | "creditsPerStep">,
  seconds?: number,
): number {
  const spec = FAMILIES[model.family];
  if (spec.media === "IMAGE") return model.creditsPerImage ?? p.imageCredits;
  const s = seconds ?? fitSeconds(spec.seconds, 5);
  if (!secondsAllowed(spec.seconds, s)) throw new PricingError(`${lengthError(spec.seconds)} on this model`);
  return Math.ceil(s / p.videoStepSeconds) * (model.creditsPerStep ?? p.videoCreditsPerStep);
}

/** Pulls the output URL out of a completed status response (image or video). */
export function outputUrl(body: unknown): string | null {
  const b = body as {
    video?: { url?: string };
    images?: Array<{ url?: string }>;
    image?: string | { url?: string };
    result?: { video_url?: string; url?: string };
  } | null;
  if (!b) return null;
  if (b.video?.url) return b.video.url;
  if (Array.isArray(b.images) && b.images[0]?.url) return b.images[0].url;
  if (typeof b.image === "string") return b.image;
  if (b.image && typeof b.image === "object" && b.image.url) return b.image.url;
  return b.result?.video_url ?? b.result?.url ?? null;
}

export type RemoteStatus = "queued" | "in_progress" | "completed" | "failed" | "nsfw" | "canceled";

/** Normalises the status words Higgsfield uses across endpoints. */
export function normaliseStatus(raw: unknown): RemoteStatus {
  const s = String(raw ?? "").toLowerCase();
  if (s === "completed" || s === "succeeded" || s === "success") return "completed";
  if (s === "failed" || s === "error") return "failed";
  if (s === "nsfw") return "nsfw";
  if (s === "canceled" || s === "cancelled") return "canceled";
  if (s === "in_progress" || s === "processing" || s === "running") return "in_progress";
  return "queued";
}
