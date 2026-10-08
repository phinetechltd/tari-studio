import { StudioApp } from "@/components/studio/studio-app";
import type { ThreadDetail } from "@/components/studio/types";
import { ApiError } from "@/lib/api";
import { can } from "@/lib/rbac";
import { requirePermission } from "@/lib/session";
import { listModels } from "@/server/ai-models";
import { wallet } from "@/server/credits";
import { getPricing } from "@/server/pricing-store";
import { listThreads, threadDetail } from "@/server/studio";
import { listCharacters } from "@/server/characters";
import { listProducts } from "@/server/products";
import { listForOrganization } from "@/server/templates";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";
export const metadata = { title: "Video Studio" };

/** The Video Studio: chat to create videos and images, and manage them by project. */
export default async function VideoStudioPage({ searchParams }: { searchParams: Promise<{ project?: string; prompt?: string; template?: string; character?: string; brand?: string; product?: string }> }) {
  const { principal, organizationId } = await requirePermission("ai:generate");
  const { project, prompt, template, character, brand, product } = await searchParams;

  const [threads, balance, pricing, models] = await Promise.all([
    listThreads(organizationId),
    wallet(organizationId),
    getPricing(),
    listModels({ enabledOnly: true }),
  ]);

  const [templates, characters, campaigns, brands, products] = await Promise.all([
    can(principal, "template:read") ? listForOrganization(organizationId, { usable: true }) : Promise.resolve([]),
    can(principal, "character:read") ? listCharacters(organizationId) : Promise.resolve([]),
    can(principal, "campaign:read")
      ? db.campaign.findMany({ where: { organizationId, status: { in: ["DRAFT", "ACTIVE", "PAUSED"] } }, orderBy: { createdAt: "desc" }, take: 50, select: { id: true, name: true } })
      : Promise.resolve([]),
    can(principal, "brand:read")
      ? db.brand.findMany({ where: { organizationId, status: "ACTIVE" }, orderBy: { name: "asc" }, select: { id: true, name: true, coverImageKey: true, logoKey: true } })
      : Promise.resolve([]),
    can(principal, "product:read") ? listProducts(organizationId) : Promise.resolve([]),
  ]);

  let detail: ThreadDetail | null = null;
  const openId = project ?? threads[0]?.id;
  if (openId) {
    try {
      detail = (await threadDetail(organizationId, openId)) as ThreadDetail;
    } catch (e) {
      if (!(e instanceof ApiError)) throw e;
    }
  }

  return (
    <>
      <StudioApp
        initialThreads={threads}
        initialDetail={detail}
        initialBalances={balance}
        pricing={pricing}
        models={models}
        canBuy={can(principal, "token:buy")}
        canAutomate={can(principal, "autopilot:write")}
        initialDraft={prompt?.slice(0, 2000)}
        contextOptions={{
          // Someone else's Pinterest pin is a style reference only, never a first frame.
          templates: templates.map((t) => ({ id: t.id, title: t.title, coverId: t.cover && t.coverOwned ? (t.cover.split("/").pop() ?? null) : null, coverUrl: t.coverOwned ? t.cover : null })),
          allowPinterest: can(principal, "template:write"),
          characters: characters.map((c) => ({ id: c.id, name: c.name, images: c.images })),
          campaigns,
          brands: brands.map((b) => ({ id: b.id, name: b.name, hasCover: Boolean(b.coverImageKey), hasLogo: Boolean(b.logoKey) })),
          products: products.map((p) => ({ id: p.id, name: p.name, brandId: p.brandId, images: p.images })),
        }}
        initialContext={{
          templateId: templates.some((t) => t.id === template) ? template : null,
          characterIds: characters.some((c) => c.id === character) ? [character!] : [],
          productId: products.some((p) => p.id === product) ? product : null,
          // A product brings its brand along when the link names no brand.
          brandId: brands.some((b) => b.id === brand) ? brand : (products.find((p) => p.id === product)?.brandId ?? null),
        }}
      />
    </>
  );
}
