import "server-only";

import { ApiError } from "@/lib/api";
import { db } from "@/lib/db";
import { providerName } from "@/lib/providers";

import { profileState } from "./brand-profile";
import { wallet } from "./credits";
import { getPricing } from "./pricing-store";

/**
 * "Set up the essentials first." Before a feature that needs data to work (Autopilot above all),
 * these checks say what is missing and where to fix it. The same checks run on the screen, in the
 * API that creates or switches on an Autopilot, and in the worker before every run, so a
 * missing brand picture or a disconnected account is caught wherever it happens.
 */

export type Need = "brand" | "brandProfile" | "product" | "channel" | "credits" | "caption";

export interface Requirement {
  key: Need;
  ok: boolean;
  title: string;
  /** Why it matters, in plain words */
  why: string;
  href: string;
  action: string;
}

export interface ReadinessScope {
  /** The brand the feature is for; when absent, any brand of the organisation counts */
  brandId?: string | null;
}

/** Whether an AI writer is configured for captions (stand-ins are refused in production). */
function captionWriterAvailable(): boolean {
  try {
    providerName("AI");
    return true;
  } catch {
    return false;
  }
}

export async function requirements(organizationId: string, needs: Need[], scope: ReadinessScope = {}): Promise<Requirement[]> {
  const brandWhere = { organizationId, status: "ACTIVE" as const, ...(scope.brandId ? { id: scope.brandId } : {}) };
  const out: Requirement[] = [];
  let firstBrand: { id: string; name: string } | null | undefined;
  const brand = async () => (firstBrand ??= await db.brand.findFirst({ where: brandWhere, orderBy: { createdAt: "asc" }, select: { id: true, name: true } }));

  for (const key of needs) {
    if (key === "brand") {
      const b = await brand();
      out.push({
        key,
        ok: Boolean(b),
        title: "Add a brand",
        why: "Everything is made for a brand: its name, voice and look.",
        href: "/app/brands/new",
        action: "Create a brand",
      });
    } else if (key === "brandProfile") {
      const b = await brand();
      const state = b ? await profileState(organizationId, b.id) : null;
      const missing = [!state?.hasSlogan && "a slogan", !state?.hasCover && "a cover picture"].filter(Boolean).join(" and ");
      out.push({
        key,
        ok: Boolean(state?.complete),
        title: state && !state.complete ? `Add ${missing} to ${b?.name}` : "Finish the brand profile",
        why: "Posts made without them look generic. The slogan goes into captions and the cover into every post.",
        href: b ? `/app/brands/${b.id}/edit` : "/app/brands/new",
        action: "Finish the profile",
      });
    } else if (key === "product") {
      const n = await db.catalogueItem.count({ where: { organizationId, status: "ACTIVE", ...(scope.brandId ? { brandId: scope.brandId } : {}) } });
      const b = await brand();
      out.push({
        key,
        ok: n > 0,
        title: "Add a product",
        why: "Autopilot needs something to show, with a picture and a price it can quote.",
        href: `/app/products/new${b ? `?brandId=${b.id}` : ""}`,
        action: "Add a product",
      });
    } else if (key === "channel") {
      const n = await db.socialChannel.count({
        where: { organizationId, status: "ACTIVE", archivedAt: null, platform: { in: ["FACEBOOK", "INSTAGRAM"] }, ...(scope.brandId ? { brandId: scope.brandId } : {}) },
      });
      const b = await brand();
      out.push({
        key,
        ok: n > 0,
        title: "Connect a Facebook or Instagram account",
        why: "That is where the posts go. WhatsApp cannot publish to a feed.",
        href: `/app/social/new${b ? `?brandId=${b.id}` : ""}`,
        action: "Connect an account",
      });
    } else if (key === "credits") {
      const [w, pricing] = await Promise.all([wallet(organizationId), getPricing()]);
      out.push({
        key,
        ok: w.unmetered || w.credits >= pricing.imageCredits,
        title: "Have credits for the first post",
        why: `Each image uses ${pricing.imageCredits} credits and each video more. Autopilot skips a run, and tells you, if there are not enough.`,
        href: "/billing",
        action: "Top up credits",
      });
    } else if (key === "caption") {
      out.push({
        key,
        ok: captionWriterAvailable(),
        title: "Caption writing needs to be switched on",
        why: "Autopilot writes the caption with the AI writer. The platform owner sets this up under Settings.",
        href: "/settings",
        action: "Open settings",
      });
    }
  }
  return out;
}

/** What must be true before an Autopilot may be created or switched on. */
export const AUTOPILOT_NEEDS: Need[] = ["brand", "brandProfile", "product", "channel", "credits", "caption"];

/** Throws the 409 the API answers with when something is missing, naming the first missing item. */
export async function assertReady(organizationId: string, needs: Need[], scope: ReadinessScope = {}): Promise<void> {
  const missing = (await requirements(organizationId, needs, scope)).filter((r) => !r.ok);
  if (missing.length > 0) {
    throw new ApiError(409, "REQUIREMENTS_UNMET", `Before this can run: ${missing.map((m) => m.title.toLowerCase()).join("; ")}.`, {
      missing: missing.map((m) => ({ key: m.key, href: m.href })),
    });
  }
}
