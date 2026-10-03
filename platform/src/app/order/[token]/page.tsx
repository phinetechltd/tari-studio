import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { OrderTracker, type TrackedOrder } from "@/components/landing/order-tracker";
import { ApiError } from "@/lib/api";
import { PRODUCT_NAME } from "@/lib/brand";
import { paystackAvailable } from "@/lib/payments";
import { orderStatus } from "@/server/orders";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Your order",
  // A private link: keep it out of search results and referrer headers.
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

/** The customer's private order page. The token in the URL is the only credential. */
export default async function OrderPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  let order: TrackedOrder;
  try {
    order = (await orderStatus(token)) as TrackedOrder;
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) notFound();
    throw e;
  }

  return (
    <div className="min-h-screen bg-surface text-ink">
      <header className="border-b border-line bg-bg">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between px-4 sm:px-6">
          <Link href="/" className="font-semibold text-ink">
            {PRODUCT_NAME}
          </Link>
          <Link href="/#order" className="text-sm font-medium text-primary">
            New order
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <p className="text-sm text-muted">Order {order.number}</p>
        <h1 className="mt-1 font-poppins text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
          {order.kind === "QUOTE" ? "Your quote request" : order.kind === "VIDEO" ? "Your video order" : "Your image order"}
        </h1>
        <p className="mt-2 text-sm text-muted">Bookmark this page. Its link is private to you.</p>
        <div className="mt-8">
          <OrderTracker initial={order} paystack={paystackAvailable()} />
        </div>
      </main>
    </div>
  );
}
