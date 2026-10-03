import crypto from "node:crypto";

/**
 * Paystack: hosted checkout (card, M-Pesa and Apple Pay, whatever the merchant
 * account has switched on in Kenya), transaction verification, and charging a
 * saved card for plan renewals.
 *
 * Endpoints (paystack.com/docs/api, checked 3 Oct 2026):
 *   POST /transaction/initialize            -> data.authorization_url
 *   GET  /transaction/verify/:reference     -> data.status, amount, currency, channel, authorization
 *   POST /transaction/charge_authorization  -> data.status for a reusable card
 *   Webhooks are signed: x-paystack-signature = HMAC-SHA512(secret key, raw body), hex.
 *
 * Amounts are in the currency's subunit, which for KES is cents: the same
 * integer the rest of the system stores. As with M-Pesa, a webhook or a
 * redirect only says *which* transaction to check; `verify` decides.
 */

export type CheckoutProviderName = "PAYSTACK" | "PAYSTACK_SIMULATOR";

export interface CheckoutInitInput {
  email: string;
  amountCents: number;
  /** Ours; Paystack echoes it on the redirect and in webhooks */
  reference: string;
  callbackUrl: string;
  metadata?: Record<string, unknown>;
}

export interface CheckoutInitResult {
  ok: boolean;
  authorizationUrl?: string;
  error?: string;
}

export interface CardAuthorization {
  code: string;
  reusable: boolean;
  /** e.g. "Visa •••• 4081" */
  label: string | null;
}

export interface CheckoutVerdict {
  status: "PENDING" | "SUCCEEDED" | "FAILED";
  amountCents?: number;
  currency?: string;
  channel?: string | null;
  receiptRef?: string | null;
  failureReason?: string;
  authorization?: CardAuthorization | null;
  raw?: unknown;
}

export interface ChargeInput {
  email: string;
  amountCents: number;
  authorizationCode: string;
  reference: string;
  metadata?: Record<string, unknown>;
}

export interface CheckoutProvider {
  readonly name: CheckoutProviderName;
  configured(): boolean;
  initialize(input: CheckoutInitInput): Promise<CheckoutInitResult>;
  /** Asks Paystack directly. The only thing allowed to say "paid". */
  verify(reference: string): Promise<CheckoutVerdict>;
  chargeAuthorization(input: ChargeInput): Promise<CheckoutVerdict>;
}

const API = "https://api.paystack.co";

/** Paystack's transaction statuses, as our three. "abandoned" can still be completed, so it waits. */
export function mapStatus(status: unknown): CheckoutVerdict["status"] {
  if (status === "success") return "SUCCEEDED";
  if (status === "failed" || status === "reversed") return "FAILED";
  return "PENDING";
}

function cardLabel(auth: Record<string, unknown> | undefined): string | null {
  if (!auth) return null;
  const brand = String(auth.brand ?? auth.card_type ?? auth.channel ?? "").trim();
  const last4 = String(auth.last4 ?? "").trim();
  if (!last4) return brand ? brand[0]!.toUpperCase() + brand.slice(1) : null;
  const name = brand ? brand[0]!.toUpperCase() + brand.slice(1) : "Card";
  return `${name} •••• ${last4}`;
}

/** Reads a verify or charge response into a verdict. Exported for tests. */
export function verdictFrom(data: Record<string, unknown>): CheckoutVerdict {
  const auth = data.authorization as Record<string, unknown> | undefined;
  const status = mapStatus(data.status);
  return {
    status,
    amountCents: typeof data.amount === "number" ? data.amount : Number(data.amount ?? NaN),
    currency: typeof data.currency === "string" ? data.currency : undefined,
    channel: typeof data.channel === "string" ? data.channel : null,
    receiptRef: data.id != null ? String(data.id) : null,
    failureReason:
      status === "FAILED" ? String(data.gateway_response ?? data.message ?? "The payment was declined.") : undefined,
    authorization:
      auth && typeof auth.authorization_code === "string"
        ? { code: auth.authorization_code, reusable: auth.reusable === true, label: cardLabel(auth) }
        : null,
    raw: { status: data.status, gateway_response: data.gateway_response, channel: data.channel, id: data.id },
  };
}

export function paystackProvider(secretKey: string | undefined): CheckoutProvider {
  async function call(path: string, init: RequestInit = {}): Promise<{ ok: boolean; status: number; body: Record<string, unknown> }> {
    const res = await fetch(`${API}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${secretKey}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
      signal: AbortSignal.timeout(20_000),
    });
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    return { ok: res.ok && body.status === true, status: res.status, body };
  }

  return {
    name: "PAYSTACK",
    configured: () => Boolean(secretKey),

    async initialize(input) {
      if (!secretKey) return { ok: false, error: "Paystack is not configured." };
      const r = await call("/transaction/initialize", {
        method: "POST",
        body: JSON.stringify({
          email: input.email,
          amount: input.amountCents,
          currency: "KES",
          reference: input.reference,
          callback_url: input.callbackUrl,
          metadata: input.metadata ?? {},
        }),
      });
      const data = r.body.data as Record<string, unknown> | undefined;
      if (!r.ok || typeof data?.authorization_url !== "string") {
        return { ok: false, error: String(r.body.message ?? "Paystack did not accept the request.") };
      }
      return { ok: true, authorizationUrl: data.authorization_url };
    },

    async verify(reference) {
      if (!secretKey) return { status: "PENDING", failureReason: "Paystack is not configured." };
      const r = await call(`/transaction/verify/${encodeURIComponent(reference)}`);
      const data = r.body.data as Record<string, unknown> | undefined;
      // Not found yet: the customer has not opened the checkout. Keep waiting.
      if (!r.ok || !data) return { status: "PENDING", raw: { message: r.body.message, http: r.status } };
      return verdictFrom(data);
    },

    async chargeAuthorization(input) {
      if (!secretKey) return { status: "FAILED", failureReason: "Paystack is not configured." };
      const r = await call("/transaction/charge_authorization", {
        method: "POST",
        body: JSON.stringify({
          email: input.email,
          amount: input.amountCents,
          currency: "KES",
          authorization_code: input.authorizationCode,
          reference: input.reference,
          metadata: input.metadata ?? {},
        }),
      });
      const data = r.body.data as Record<string, unknown> | undefined;
      if (!data) {
        return { status: "FAILED", failureReason: String(r.body.message ?? "Paystack refused the charge."), raw: r.body };
      }
      return verdictFrom(data);
    },
  };
}

// ---------------------------------------------------------------------------
// Simulator, for development and tests. Production refuses it (src/lib/providers.ts).

type SimOutcome = "success" | "failed";
const SIM_KEY = Symbol.for("tari.paystackSimulator");
const outcomes: Map<string, SimOutcome> = ((globalThis as Record<symbol, unknown>)[SIM_KEY] as Map<string, SimOutcome>) ??
  ((globalThis as Record<symbol, unknown>)[SIM_KEY] = new Map<string, SimOutcome>());

/** The simulator's checkout page records what the "customer" did. */
export function simulateCheckout(reference: string, outcome: SimOutcome): void {
  outcomes.set(reference, outcome);
}

export function paystackSimulator(baseUrl: string): CheckoutProvider {
  return {
    name: "PAYSTACK_SIMULATOR",
    configured: () => true,

    async initialize(input) {
      const url = new URL("/pay/simulator", baseUrl);
      url.searchParams.set("reference", input.reference);
      // Like Paystack, send the customer back to the callback with ?reference=… (same origin only).
      const back = new URL(input.callbackUrl);
      url.searchParams.set("callback", back.pathname + back.search);
      return { ok: true, authorizationUrl: url.toString() };
    },

    async verify(reference) {
      const outcome = outcomes.get(reference);
      if (outcome === "success") {
        return {
          status: "SUCCEEDED",
          channel: "card",
          receiptRef: `SIM${reference.slice(-8).toUpperCase()}`,
          authorization: { code: `AUTH_sim_${reference}`, reusable: true, label: "Visa •••• 4081" },
          raw: { simulator: true, outcome },
        };
      }
      if (outcome === "failed") return { status: "FAILED", failureReason: "Declined by the simulator.", raw: { simulator: true } };
      return { status: "PENDING", raw: { simulator: true } };
    },

    async chargeAuthorization(input) {
      // A saved card whose code mentions "fail" is declined, so renewals can be tested both ways.
      if (input.authorizationCode.includes("fail")) {
        return { status: "FAILED", failureReason: "Insufficient funds (simulated).", raw: { simulator: true } };
      }
      return {
        status: "SUCCEEDED",
        amountCents: input.amountCents,
        currency: "KES",
        channel: "card",
        receiptRef: `SIM${input.reference.slice(-8).toUpperCase()}`,
        authorization: { code: input.authorizationCode, reusable: true, label: "Visa •••• 4081" },
        raw: { simulator: true },
      };
    },
  };
}

// ---------------------------------------------------------------------------

/** True when `signature` is Paystack's HMAC-SHA512 of the raw request body. */
export function verifyPaystackSignature(rawBody: string, signature: string | null, secretKey: string | undefined): boolean {
  if (!signature || !secretKey) return false;
  const expected = crypto.createHmac("sha512", secretKey).update(rawBody, "utf8").digest("hex");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(signature.trim().toLowerCase(), "utf8");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** A reference Paystack accepts: letters, digits, '-', '.', '=' only. */
export function newReference(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${crypto.randomBytes(6).toString("hex")}`.toUpperCase();
}
