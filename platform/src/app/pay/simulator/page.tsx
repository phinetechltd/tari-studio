import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { BrandLogo } from "@/components/brand-logo";
import { isProduction } from "@/lib/env";
import { formatKES } from "@/lib/money";
import { configuredProviderName } from "@/lib/providers";
import { safeNext } from "@/lib/safe-next";
import { intentByReference } from "@/server/payments";

import { SimulatorButtons } from "./simulator-buttons";

export const metadata: Metadata = { title: "Paystack simulator", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/**
 * Stands in for Paystack's hosted checkout in development (PAYSTACK_PROVIDER=
 * simulator). Production and live mode get a 404: nothing here can mark a
 * real payment paid.
 */
export default async function PaystackSimulatorPage({ searchParams }: { searchParams: Promise<{ reference?: string; callback?: string }> }) {
  if (isProduction() || configuredProviderName("PAYSTACK") !== "simulator") notFound();
  const { reference, callback } = await searchParams;
  const intent = reference ? await intentByReference(reference) : null;
  if (!intent || intent.provider !== "PAYSTACK_SIMULATOR") notFound();
  const back = safeNext(callback) ?? "/";

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#0b1220] px-4 py-12 text-white">
      <div className="w-full max-w-sm rounded-3xl bg-white p-6 text-neutral-900 shadow-2xl">
        <div className="flex items-center justify-between">
          <BrandLogo tone="afro" height={28} />
          <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-semibold uppercase text-amber-800">Simulator</span>
        </div>
        <p className="mt-6 text-sm text-neutral-500">{intent.email}</p>
        <p className="mt-1 text-3xl font-bold">{formatKES(intent.amountCents)}</p>
        <p className="mt-4 rounded-xl bg-neutral-50 p-3 text-xs text-neutral-500">
          This is a pretend Paystack checkout for development. No money moves. Choose what the customer does.
        </p>
        <SimulatorButtons reference={intent.providerRef!} back={back} />
        <p className="mt-4 text-center text-[11px] text-neutral-400">Reference {intent.providerRef}</p>
      </div>
    </main>
  );
}
