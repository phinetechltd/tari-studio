import type { Metadata } from "next";

import { AutopilotWizard, type WizardStart } from "@/components/autopilot/wizard";
import { RequirementsGate } from "@/components/requirements-gate";
import { PageHeader } from "@/components/ui";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/session";
import { listCharacters } from "@/server/characters";
import { getPricing } from "@/server/pricing-store";
import { listProducts } from "@/server/products";
import { AUTOPILOT_NEEDS, requirements } from "@/server/readiness";
import { listPublished } from "@/server/templates";
import type { QuoteMeta } from "@/server/studio";

export const metadata: Metadata = { title: "New Autopilot" };
export const dynamic = "force-dynamic";

export default async function NewAutopilotPage({ searchParams }: { searchParams: Promise<{ brand?: string; product?: string; asset?: string }> }) {
  const { organizationId } = await requirePermission("autopilot:write");
  const { brand, product, asset } = await searchParams;
  const reqs = await requirements(organizationId, AUTOPILOT_NEEDS);

  const [brands, products, characters, templates, channels, pricing] = await Promise.all([
    db.brand.findMany({ where: { organizationId, status: "ACTIVE" }, orderBy: { name: "asc" }, select: { id: true, name: true, timezone: true } }),
    listProducts(organizationId),
    listCharacters(organizationId),
    listPublished(),
    db.socialChannel.findMany({ where: { organizationId, status: "ACTIVE", archivedAt: null, platform: { in: ["FACEBOOK", "INSTAGRAM"] } }, select: { id: true, brandId: true, name: true, platform: true } }),
    getPricing(),
  ]);

  // Starting values: from a finished Studio result ("Make this automatic"), a product, a brand, or a blank.
  let fromQuote: QuoteMeta | null = null;
  if (asset) {
    const m = await db.studioMessage.findFirst({ where: { assetId: asset, organizationId }, select: { meta: true } });
    fromQuote = (m?.meta as unknown as QuoteMeta | null) ?? null;
  }
  const productRow = products.find((p) => p.id === (fromQuote?.productId ?? product));
  const brandId = brands.find((b) => b.id === (fromQuote?.brandId ?? brand ?? productRow?.brandId))?.id ?? brands[0]?.id ?? "";
  const start: WizardStart = {
    name: productRow ? `${productRow.name} posts` : "",
    brandId,
    contentKind: fromQuote && fromQuote.mode !== "image" ? "VIDEO" : "IMAGE",
    seconds: fromQuote?.seconds ?? 10,
    aspectRatio: fromQuote?.aspectRatio ?? "1:1",
    productIds: productRow ? [productRow.id] : [],
    characterIds: (fromQuote?.characterIds ?? []).filter((id) => characters.some((c) => c.id === id)),
    templateId: templates.some((t) => t.id === fromQuote?.templateId) ? (fromQuote!.templateId ?? null) : null,
    guidance: fromQuote?.prompt?.replace(/\s*Changes requested:.*$/s, "").slice(0, 600) ?? "",
  };

  return (
    <>
      <PageHeader title="New Autopilot" subtitle="Four short steps. Nothing is posted until you say so." back={{ href: "/app/autopilot", label: "Autopilot" }} />
      <RequirementsGate requirements={reqs}>
        <AutopilotWizard
          pricing={pricing}
          start={start}
          options={{
            brands,
            products: products.map((p) => ({ id: p.id, brandId: p.brandId, name: p.name, cover: p.cover, outOfStock: p.outOfStock })),
            characters: characters.map((c) => ({ id: c.id, name: c.name, cover: c.cover })),
            templates: templates.map((t) => ({ id: t.id, title: t.title })),
            channels,
          }}
        />
      </RequirementsGate>
    </>
  );
}