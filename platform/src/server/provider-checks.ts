import "server-only";

import { db } from "@/lib/db";
import { env } from "@/lib/env";

import { aiStatus, probeAi } from "./ai";

/**
 * Live connectivity checks for every external provider, used by the platform
 * admin's "Test connections" button and by `npm run check:providers`. Each one
 * is the cheapest call that proves the credentials (one short AI reply, a Meta
 * app token, a Daraja OAuth token). Nothing is posted, sent or charged, and no
 * result carries a secret.
 */

export type CheckOutcome = "ok" | "fail" | "skip";
export interface ProviderCheck {
  name: string;
  outcome: CheckOutcome;
  detail: string;
}

const message = (error: unknown) => (error instanceof Error ? error.message : String(error)).slice(0, 300);

export async function runProviderChecks(): Promise<ProviderCheck[]> {
  const e = env();
  const results: ProviderCheck[] = [];

  try {
    await db.$queryRaw`SELECT 1`;
    results.push({ name: "Database", outcome: "ok", detail: "reachable" });
  } catch (error) {
    results.push({ name: "Database", outcome: "fail", detail: message(error) });
  }

  const status = aiStatus();
  const chain = status.chain.map((c) => `${c.provider}:${c.model}${c.keyLoaded ? "" : " (no key)"}`).join(" → ");
  if (status.chain.every((c) => c.provider === "fixtures")) {
    results.push({ name: "AI", outcome: "skip", detail: `Fixtures only. Choose Anthropic and add a key to use Claude.` });
  } else {
    try {
      const r = await probeAi();
      results.push({
        name: "AI",
        outcome: "ok",
        detail: `${r.provider} ${r.model} answered in ${r.latencyMs} ms (${r.inputTokens} in / ${r.outputTokens} out tokens): “${r.text.slice(0, 60)}”`,
      });
    } catch (error) {
      results.push({ name: "AI", outcome: "fail", detail: `${chain}: ${message(error)}` });
    }
  }

  if (e.META_PROVIDER !== "graph") {
    results.push({ name: "Meta", outcome: "skip", detail: "Simulator. Switch to Live with a Meta app ID and secret." });
  } else if (!e.META_APP_ID || !e.META_APP_SECRET) {
    results.push({ name: "Meta", outcome: "fail", detail: "The Meta app ID or app secret is missing." });
  } else {
    try {
      const url = new URL(`https://graph.facebook.com/${e.META_GRAPH_VERSION}/oauth/access_token`);
      url.searchParams.set("client_id", e.META_APP_ID);
      url.searchParams.set("client_secret", e.META_APP_SECRET);
      url.searchParams.set("grant_type", "client_credentials");
      const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
      const json = (await res.json().catch(() => ({}))) as { access_token?: string; error?: { message?: string } };
      results.push(
        json.access_token
          ? { name: "Meta", outcome: "ok", detail: `App ${e.META_APP_ID} accepted by Graph ${e.META_GRAPH_VERSION}.` }
          : { name: "Meta", outcome: "fail", detail: json.error?.message ?? `HTTP ${res.status}` },
      );
    } catch (error) {
      results.push({ name: "Meta", outcome: "fail", detail: message(error) });
    }
    results.push({
      name: "WhatsApp webhook",
      outcome: e.META_WEBHOOK_VERIFY_TOKEN ? "ok" : "fail",
      detail: e.META_WEBHOOK_VERIFY_TOKEN
        ? `${e.APP_BASE_URL.replace(/\/$/, "")}/api/webhooks/whatsapp, verify token set.`
        : "The webhook verify token is not set.",
    });
  }

  if (e.PAYMENT_PROVIDER !== "daraja") {
    results.push({ name: "M-Pesa", outcome: "skip", detail: "Simulator. Switch to Live with your Daraja app." });
  } else {
    try {
      const host = e.MPESA_ENV === "production" ? "https://api.safaricom.co.ke" : "https://sandbox.safaricom.co.ke";
      const basic = Buffer.from(`${e.MPESA_CONSUMER_KEY ?? ""}:${e.MPESA_CONSUMER_SECRET ?? ""}`).toString("base64");
      const res = await fetch(`${host}/oauth/v1/generate?grant_type=client_credentials`, {
        headers: { Authorization: `Basic ${basic}` },
        signal: AbortSignal.timeout(15_000),
      });
      const json = (await res.json().catch(() => ({}))) as { access_token?: string };
      results.push(
        json.access_token
          ? { name: "M-Pesa", outcome: "ok", detail: `Daraja ${e.MPESA_ENV} accepted the consumer key.` }
          : { name: "M-Pesa", outcome: "fail", detail: `Daraja refused the credentials (HTTP ${res.status}).` },
      );
    } catch (error) {
      results.push({ name: "M-Pesa", outcome: "fail", detail: message(error) });
    }
  }

  if (e.PAYSTACK_PROVIDER === "off") {
    results.push({ name: "Paystack", outcome: "skip", detail: "Off. Customers pay by M-Pesa only." });
  } else if (e.PAYSTACK_PROVIDER !== "paystack") {
    results.push({ name: "Paystack", outcome: "skip", detail: "Simulator. Switch to Live with your Paystack secret key." });
  } else if (!e.PAYSTACK_SECRET_KEY) {
    results.push({ name: "Paystack", outcome: "fail", detail: "The Paystack secret key is missing." });
  } else {
    try {
      // A read that changes nothing: list at most one transaction.
      const res = await fetch("https://api.paystack.co/transaction?perPage=1", {
        headers: { Authorization: `Bearer ${e.PAYSTACK_SECRET_KEY}` },
        signal: AbortSignal.timeout(15_000),
      });
      const json = (await res.json().catch(() => ({}))) as { status?: boolean; message?: string };
      const mode = e.PAYSTACK_SECRET_KEY.startsWith("sk_live_") ? "live" : "test";
      results.push(
        json.status
          ? { name: "Paystack", outcome: "ok", detail: `Paystack accepted the ${mode} secret key.` }
          : { name: "Paystack", outcome: "fail", detail: json.message ?? `HTTP ${res.status}` },
      );
    } catch (error) {
      results.push({ name: "Paystack", outcome: "fail", detail: message(error) });
    }
  }

  if (e.EMAIL_PROVIDER !== "smtp") {
    results.push({ name: "Email", outcome: "skip", detail: "Console stand-in. Enter an SMTP account under Email (SMTP)." });
  } else if (!e.SMTP_HOST || !(e.EMAIL_FROM ?? e.SMTP_USER)) {
    results.push({ name: "Email", outcome: "fail", detail: "The SMTP host or From address is missing." });
  } else {
    try {
      // Connects and authenticates; sends nothing.
      const nodemailer = await import("nodemailer");
      const t = nodemailer.createTransport({
        host: e.SMTP_HOST,
        port: e.SMTP_PORT,
        secure: e.SMTP_SECURE,
        auth: e.SMTP_USER ? { user: e.SMTP_USER, pass: e.SMTP_PASSWORD ?? "" } : undefined,
        connectionTimeout: 15_000,
        greetingTimeout: 15_000,
      });
      await t.verify();
      t.close();
      results.push({ name: "Email", outcome: "ok", detail: `${e.SMTP_HOST}:${e.SMTP_PORT} accepted the login. Send a test from Notifications.` });
    } catch (error) {
      results.push({ name: "Email", outcome: "fail", detail: message(error) });
    }
  }

  if (e.SMS_PROVIDER === "off") {
    results.push({ name: "SMS", outcome: "skip", detail: "Off. No SMS notifications are sent." });
  } else if (e.SMS_PROVIDER !== "bonga") {
    results.push({ name: "SMS", outcome: "skip", detail: "Console stand-in. Enter Bonga credentials under SMS (Bonga)." });
  } else {
    // Bonga has no free "who am I" call and every send costs money, so only the configuration is checked here.
    const missing = [
      ["client ID", e.BONGA_SMS_CLIENT_ID],
      ["API key", e.BONGA_SMS_API_KEY],
      ["API secret", e.BONGA_SMS_API_SECRET],
      ["service ID", e.BONGA_SMS_SERVICE_ID],
    ]
      .filter(([, v]) => !v)
      .map(([k]) => k);
    results.push(
      missing.length
        ? { name: "SMS", outcome: "fail", detail: `Bonga ${missing.join(", ")} missing.` }
        : { name: "SMS", outcome: "ok", detail: `Bonga credentials loaded (${e.BONGA_SMS_ENDPOINT}). Send a test SMS from Notifications to prove them.` },
    );
  }

  if (e.GENERATION_PROVIDER !== "higgsfield") {
    results.push({ name: "Image & video", outcome: "skip", detail: "Simulator. Switch to Live with Higgsfield credentials." });
  } else {
    results.push(
      e.HF_CREDENTIALS?.includes(":")
        ? { name: "Image & video", outcome: "ok", detail: "Higgsfield credentials loaded; checked on the first generation." }
        : { name: "Image & video", outcome: "fail", detail: "Higgsfield credentials are missing (KEY_ID:KEY_SECRET)." },
    );
  }

  return results;
}
