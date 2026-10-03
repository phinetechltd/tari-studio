import type { Metadata } from "next";

import { Hint } from "@/components/hints/hint";
import { PricingEditor } from "@/components/pricing/pricing-editor";
import { Notice, PageHeader } from "@/components/ui";
import { requirePlatform } from "@/lib/session";
import { pricingStatus } from "@/server/pricing-store";

export const metadata: Metadata = { title: "Pricing" };
export const dynamic = "force-dynamic";

/** Platform admin → Pricing: plans, credit costs and top-up packs for every customer. */
export default async function PlatformPricingPage() {
  const { principal } = await requirePlatform();
  const status = await pricingStatus();

  return (
    <>
      <PageHeader title="Pricing" subtitle="What customers pay: plans, credits per generation and top-up packs. Shown on the landing page, /pricing, Billing and in the Studio." />
      <Hint id="platform.pricing" title="Prices change new purchases only">
        Running plans keep the price and credits they were bought at until the customer changes plan. Each model&apos;s own price is set under AI &amp; credits.
      </Hint>
      {!principal.mfa ? (
        <Notice tone="warning" title="Two-factor sign-in is needed to save">
          Turn on two-factor authentication under Security before changing prices.
        </Notice>
      ) : null}
      <div className="mt-4">
        <PricingEditor initial={status} />
      </div>
    </>
  );
}
