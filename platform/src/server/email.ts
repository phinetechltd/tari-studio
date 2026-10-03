import "server-only";

import nodemailer, { type Transporter } from "nodemailer";

import { PRODUCT_EMAIL_FROM_NAME } from "@/lib/brand";
import { env } from "@/lib/env";
import { providerName } from "@/lib/providers";

/**
 * Transactional email: invitations, receipts and notification emails.
 *
 *   console  records the message and prints it (development and CI);
 *            `providers.ts` refuses it in production, so an unconfigured
 *            deployment fails loudly instead of saying "sent" while nothing left
 *   smtp     any SMTP relay, configured in Platform admin → Settings →
 *            Email (SMTP) or the .env (SMTP_HOST, SMTP_USER, SMTP_PASSWORD, …)
 *
 * A failed live send is reported as a failure. The console adapter is never a
 * fallback for it.
 */

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export interface EmailResult {
  ok: boolean;
  error?: string;
  /** The provider's message id, when it gave one */
  id?: string;
  /** Sent through the console stand-in, not a real provider */
  mock?: boolean;
  provider?: string;
}

export interface EmailProvider {
  readonly name: string;
  send(message: EmailMessage): Promise<EmailResult>;
}

// Shared across module reloads so tests can read what was "sent".
const globalForOutbox = globalThis as unknown as { __emailOutbox?: EmailMessage[] };
export const outbox: EmailMessage[] = (globalForOutbox.__emailOutbox ??= []);

const consoleProvider: EmailProvider = {
  name: "console",
  async send(message) {
    outbox.push(message);
    console.info(`[email:console] ${PRODUCT_EMAIL_FROM_NAME} → ${message.to}: ${message.subject}`);
    return { ok: true, mock: true, provider: "console", id: `console-${outbox.length}` };
  },
};

let transport: { signature: string; transporter: Transporter } | null = null;

function smtpProvider(): EmailProvider {
  const e = env();
  return {
    name: "smtp",
    async send(message) {
      if (!e.SMTP_HOST) return { ok: false, provider: "smtp", error: "The SMTP host is not set (Settings → Email)." };
      const from = e.EMAIL_FROM ?? e.SMTP_USER;
      if (!from || !from.includes("@")) return { ok: false, provider: "smtp", error: "The From address is not set (Settings → Email)." };

      // One pooled connection per configuration; a change in the dashboard builds a new one.
      const signature = [e.SMTP_HOST, e.SMTP_PORT, e.SMTP_SECURE, e.SMTP_USER ?? "", e.SMTP_PASSWORD ?? ""].join("|");
      if (transport?.signature !== signature) {
        transport?.transporter.close();
        transport = {
          signature,
          transporter: nodemailer.createTransport({
            host: e.SMTP_HOST,
            port: e.SMTP_PORT,
            secure: e.SMTP_SECURE,
            auth: e.SMTP_USER ? { user: e.SMTP_USER, pass: e.SMTP_PASSWORD ?? "" } : undefined,
            pool: true,
            maxConnections: 2,
            connectionTimeout: 15_000,
            greetingTimeout: 15_000,
            socketTimeout: 30_000,
          }),
        };
      }
      try {
        const info = await transport.transporter.sendMail({
          from: { name: e.EMAIL_FROM_NAME || PRODUCT_EMAIL_FROM_NAME, address: from },
          to: message.to,
          replyTo: e.EMAIL_REPLY_TO,
          subject: message.subject,
          text: message.text,
          html: message.html,
        });
        const rejected = (info.rejected ?? []).map(String);
        if (rejected.length) return { ok: false, provider: "smtp", error: `The server refused ${rejected.join(", ")}.` };
        return { ok: true, provider: "smtp", id: info.messageId };
      } catch (error) {
        return { ok: false, provider: "smtp", error: (error instanceof Error ? error.message : String(error)).slice(0, 300) };
      }
    },
  };
}

function provider(): EmailProvider {
  const name = providerName("EMAIL"); // throws for the console stand-in in production
  return name === "smtp" ? smtpProvider() : consoleProvider;
}

export async function sendEmail(message: EmailMessage): Promise<EmailResult> {
  return provider().send(message);
}

/**
 * The HTML twin of a plain-text email made by renderEmail(): the first line is
 * the heading, a "Label: https://…" line becomes the button, and everything
 * after a "--" line is the footer. Deliveries store the text; this rebuilds the
 * HTML when the worker sends it.
 */
export function htmlFromText(product: string, text: string): string {
  const lines = text.split("\n");
  const title = lines.shift()?.trim() || product;
  const cut = lines.indexOf("--");
  const main = (cut >= 0 ? lines.slice(0, cut) : lines).join("\n");
  const footer = cut >= 0 ? lines.slice(cut + 1).join(" ").trim() : null;
  let action: { label: string; url: string } | null = null;
  const bodyLines = main.split("\n").filter((line) => {
    const m = /^([\w ]{2,30}): (https?:\/\/\S+)$/.exec(line.trim());
    if (m && !action) {
      action = { label: m[1]!, url: m[2]! };
      return false;
    }
    return true;
  });
  return renderEmail({ product, title, body: bodyLines.join("\n"), action, footer }).html;
}

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * A plain, readable branded email: a heading, the message, an optional button
 * and a footer. Inline styles only, since mail clients drop stylesheets.
 */
export function renderEmail(opts: { product: string; title: string; body?: string | null; action?: { label: string; url: string } | null; footer?: string | null }): { text: string; html: string } {
  const paragraphs = (opts.body ?? "").split(/\n{2,}|\n/).map((p) => p.trim()).filter(Boolean);
  const text = [opts.title, "", ...paragraphs, ...(opts.action ? ["", `${opts.action.label}: ${opts.action.url}`] : []), ...(opts.footer ? ["", "--", opts.footer] : [])].join("\n");
  const html = `<!doctype html><html><body style="margin:0;background:#f4f4f5;padding:24px 12px;font-family:Arial,Helvetica,sans-serif;color:#18181b">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center">
<table role="presentation" width="100%" style="max-width:560px;background:#ffffff;border-radius:14px;overflow:hidden" cellspacing="0" cellpadding="0">
<tr><td style="background:#0a0a0a;padding:18px 24px;color:#ffffff;font-weight:bold;font-size:16px;letter-spacing:.3px">${escapeHtml(opts.product)}</td></tr>
<tr><td style="padding:28px 24px 8px"><h1 style="margin:0 0 12px;font-size:20px;line-height:1.3">${escapeHtml(opts.title)}</h1>
${paragraphs.map((p) => `<p style="margin:0 0 12px;font-size:15px;line-height:1.55;color:#3f3f46">${escapeHtml(p)}</p>`).join("\n")}
${opts.action ? `<p style="margin:20px 0 8px"><a href="${escapeHtml(opts.action.url)}" style="display:inline-block;background:#7c3aed;color:#ffffff;text-decoration:none;font-weight:bold;padding:12px 20px;border-radius:999px;font-size:14px">${escapeHtml(opts.action.label)}</a></p>` : ""}
</td></tr>
${opts.footer ? `<tr><td style="padding:16px 24px 24px;font-size:12px;line-height:1.5;color:#71717a;border-top:1px solid #f4f4f5">${escapeHtml(opts.footer)}</td></tr>` : ""}
</table></td></tr></table></body></html>`;
  return { text, html };
}
