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
import { listPublished } from "@/server/templates";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";
export const metadata = { title: "Video Studio" };

/** The Video Studio: chat to create videos and images, and manage them by project. */
export default async function VideoStudioPage({ searchParams }: { searchParams: Promise<{ project?: string; prompt?: string; template?: string; character?: string }> }) {
  const { principal, organizationId } = await requirePermission("ai:generate");
  const { project, prompt, template, character } = await searchParams;

  const [threads, balance, pricing, models] = await Promise.all([
    listThreads(organizationId),
    wallet(organizationId),
    getPricing(),
    listModels({ enabledOnly: true }),
  ]);

  const [templates, characters, campaigns] = await Promise.all([
    can(principal, "template:read") ? listPublished() : Promise.resolve([]),
    can(principal, "character:read") ? listCharacters(organizationId) : Promise.resolve([]),
    can(principal, "campaign:read")
      ? db.campaign.findMany({ where: { organizationId, status: { in: ["DRAFT", "ACTIVE", "PAUSED"] } }, orderBy: { createdAt: "desc" }, take: 50, select: { id: true, name: true } })
      : Promise.resolve([]),
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
        initialDraft={prompt?.slice(0, 2000)}
        contextOptions={{
          templates: templates.map((t) => ({ id: t.id, title: t.title })),
          characters: characters.map((c) => ({ id: c.id, name: c.name, cover: c.cover })),
          campaigns,
        }}
        initialContext={{
          templateId: templates.some((t) => t.id === template) ? template : null,
          characterIds: characters.some((c) => c.id === character) ? [character!] : [],
        }}
      />
    </>
  );
}
