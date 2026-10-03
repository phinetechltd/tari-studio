import { isAspectRatio, MODES, type AspectRatio, type GenerationMode } from "./generation-models";
import { creditsToCents, VIDEO_MAX_SECONDS, VIDEO_MIN_SECONDS, videoCreditsFor, type Pricing } from "./pricing";

/**
 * Reads what a Studio message asks for: the mode (from a slash command), the
 * clip length ("15 seconds") and the shape ("vertical", "16:9"). Pure and
 * shared, so the landing page's demo quotes exactly what the Studio would.
 */

export type StudioCommand = GenerationMode | "quote" | "help";

export interface Intent {
  mode: GenerationMode;
  prompt: string;
  seconds: number | null;
  aspectRatio: AspectRatio;
}

const COMMANDS: Record<string, StudioCommand> = {
  "/video": "video",
  "/image": "image",
  "/animate": "animate",
  "/extend": "extend",
  "/quote": "quote",
  "/help": "help",
};

export const DEFAULT_VIDEO_SECONDS = 10;

export function interpret(text: string): { command: StudioCommand; meta: Intent } {
  let body = text.trim();
  let command: StudioCommand = "video";
  const slash = /^\/(\w+)\b\s*/.exec(body);
  if (slash) {
    command = COMMANDS[`/${slash[1]!.toLowerCase()}`] ?? "help";
    body = body.slice(slash[0].length).trim();
  }

  const mode: GenerationMode = command === "quote" || command === "help" ? "video" : command;

  let seconds: number | null = null;
  if (MODES[mode].media === "VIDEO") {
    const m = /(\d{1,2})\s*(?:s\b|sec\b|secs\b|second|seconds|-second)/i.exec(body);
    seconds = m ? Math.min(VIDEO_MAX_SECONDS, Math.max(VIDEO_MIN_SECONDS, Number(m[1]))) : DEFAULT_VIDEO_SECONDS;
  }

  let aspectRatio: AspectRatio = MODES[mode].defaultAspect;
  const ratio = /\b(\d{1,2}:\d{1,2})\b/.exec(body)?.[1];
  if (isAspectRatio(ratio)) aspectRatio = ratio;
  else if (/\b(vertical|portrait|reels?|tiktok|stories|story|status)\b/i.test(body)) aspectRatio = "9:16";
  else if (/\b(landscape|horizontal|youtube|widescreen|wide)\b/i.test(body)) aspectRatio = "16:9";
  else if (/\b(square|instagram post|feed post)\b/i.test(body)) aspectRatio = "1:1";

  return { command, meta: { mode, prompt: body, seconds, aspectRatio } };
}

/** Credits for an intent, and their shilling value at the pay-as-you-go rate. */
export function costOf(p: Pricing, meta: Pick<Intent, "mode" | "seconds">): { credits: number; cents: number } {
  const credits = MODES[meta.mode].media === "IMAGE" ? p.imageCredits : videoCreditsFor(p, meta.seconds ?? DEFAULT_VIDEO_SECONDS);
  return { credits, cents: creditsToCents(p, credits) };
}
