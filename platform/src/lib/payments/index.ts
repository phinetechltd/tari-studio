import "server-only";

import { env, isProduction } from "../env";
import { configuredProviderName, providerName } from "../providers";

import { darajaProvider } from "./daraja";
import { paystackProvider, paystackSimulator, type CheckoutProvider } from "./paystack";
import { simulatorProvider } from "./simulator";
import type { StkProvider, StkProviderName } from "./types";

export type { StkProvider, StkProviderName } from "./types";
export type { CheckoutProvider } from "./paystack";

/**
 * Whether customers may choose Paystack. "off" hides it; the simulator is
 * offered in development only, so production never shows a method that would
 * refuse to run.
 */
export function paystackAvailable(): boolean {
  const name = configuredProviderName("PAYSTACK");
  if (name === "off") return false;
  if (name === "simulator") return !isProduction();
  return Boolean(env().PAYSTACK_SECRET_KEY);
}

/** M-Pesa STK is available unless production is still pointed at the simulator. */
export function mpesaAvailable(): boolean {
  return configuredProviderName("PAYMENT") === "daraja" || !isProduction();
}

/** The Paystack provider new checkouts go through. Refuses the simulator in production. */
export function checkoutProvider(): CheckoutProvider {
  const name = providerName("PAYSTACK");
  if (name === "off") throw new Error("Paystack is switched off (PAYSTACK_PROVIDER=off).");
  return name === "paystack" ? paystackProvider(env().PAYSTACK_SECRET_KEY) : paystackSimulator(env().APP_BASE_URL);
}

/** The provider an existing Paystack intent was created with, never the other one. */
export function checkoutProviderFor(name: string): CheckoutProvider | null {
  if (name === "PAYSTACK") return paystackProvider(env().PAYSTACK_SECRET_KEY);
  if (name === "PAYSTACK_SIMULATOR") return providerName("PAYSTACK") === "simulator" ? paystackSimulator(env().APP_BASE_URL) : null;
  return null;
}

export function isCheckoutProviderName(name: string): boolean {
  return name === "PAYSTACK" || name === "PAYSTACK_SIMULATOR";
}

/** The provider new payments go through, per PAYMENT_PROVIDER. Refuses the simulator in production. */
export function stkProvider(): StkProvider {
  return providerName("PAYMENT") === "daraja" ? darajaFromEnv() : simulatorProvider();
}

/**
 * The provider an existing intent was created with. A payment started on the
 * simulator is never re-checked against Daraja, or the other way round.
 */
export function stkProviderFor(name: string): StkProvider | null {
  if (name === "MPESA_DARAJA") return darajaFromEnv();
  if (name === "SIMULATOR") return providerName("PAYMENT") === "simulator" ? simulatorProvider() : null;
  return null;
}

function darajaFromEnv(): StkProvider {
  const e = env();
  return darajaProvider({
    env: e.MPESA_ENV,
    consumerKey: e.MPESA_CONSUMER_KEY,
    consumerSecret: e.MPESA_CONSUMER_SECRET,
    shortcode: e.MPESA_SHORTCODE,
    passkey: e.MPESA_PASSKEY,
    transactionType: e.MPESA_TRANSACTION_TYPE,
    partyB: e.MPESA_PARTY_B,
  });
}

export function callbackUrl(): string {
  return new URL("/api/payments/mpesa/callback", env().APP_BASE_URL).toString();
}

export const PROVIDER_NAMES: readonly StkProviderName[] = ["MPESA_DARAJA", "SIMULATOR"];
