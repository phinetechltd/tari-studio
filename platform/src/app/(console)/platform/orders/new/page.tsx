import type { Metadata } from "next";
import Link from "next/link";

import { OrderAdminForm } from "@/components/platform/order-admin";
import { PageHeader } from "@/components/ui";
import { requirePlatform } from "@/lib/session";

export const metadata: Metadata = { title: "New order" };
export const dynamic = "force-dynamic";

/** An order taken by phone or WhatsApp, entered by an admin with its price. */
export default async function NewOrderPage() {
  await requirePlatform();
  return (
    <>
      <Link href="/platform/orders" className="mb-3 inline-flex text-sm text-muted hover:text-ink">
        All orders
      </Link>
      <PageHeader title="New order" subtitle="For a customer who asked outside the website. Set the price, then send it to them to pay." />
      <div className="max-w-3xl">
        <OrderAdminForm
          mode="create"
          initial={{
            kind: "IMAGE",
            images: 1,
            seconds: 10,
            aspectRatio: "1:1",
            brief: "",
            extras: [],
            referenceLink: "",
            name: "",
            phone: "",
            email: "",
            business: "",
            adminNote: "",
            priceKes: "",
          }}
        />
      </div>
    </>
  );
}
