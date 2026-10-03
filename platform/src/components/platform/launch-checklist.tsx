import { CheckCircle2, CircleAlert } from "lucide-react";
import Link from "next/link";

import { env, isProduction } from "@/lib/env";
import { secretsAvailable } from "@/lib/secrets";
import { getBudget, providerBalance } from "@/server/ai-credits";

/**
 * What still stands between this deployment and taking real money: each line
 * is read from the settings in force, never assumed. Shown to platform admins
 * on the Organisations page until everything is ticked.
 */
export async function LaunchChecklist() {
  const e = env();
  const [balance, budget] = await Promise.all([providerBalance(), getBudget()]);
  const items: Array<{ ok: boolean; label: string; fix: string; href: string }> = [
    { ok: e.APP_BASE_URL.startsWith("https://"), label: "Public address uses HTTPS", fix: "Set APP_BASE_URL to the https:// address in the server's .env.", href: "/settings" },
    { ok: secretsAvailable(), label: "Key vault ready", fix: "Set CREDENTIALS_KEY in the server's .env so keys can be stored.", href: "/settings" },
    { ok: e.PAYMENT_PROVIDER === "daraja" || e.PAYSTACK_PROVIDER === "paystack", label: "Live payments (M-Pesa or Paystack)", fix: "Switch M-Pesa or Paystack to Live in Settings.", href: "/settings#deployment" },
    { ok: e.GENERATION_PROVIDER === "higgsfield", label: "Live image and video generation", fix: "Switch Image & video to Live with Higgsfield credentials.", href: "/settings#deployment" },
    { ok: e.AI_PROVIDER !== "fixtures", label: "Live AI writing (Claude)", fix: "Choose Anthropic and add an API key.", href: "/settings#deployment" },
    { ok: e.EMAIL_PROVIDER === "smtp", label: "Email sends through SMTP", fix: "Enter your SMTP account under Email.", href: "/settings#deployment" },
    { ok: e.SMS_PROVIDER === "bonga" || e.SMS_PROVIDER === "off", label: "SMS through Bonga (or switched off)", fix: "Enter Bonga credentials under SMS, or switch SMS off.", href: "/settings#deployment" },
    { ok: balance.hasTopUps, label: "Higgsfield top-up recorded", fix: "Record what your Higgsfield account holds so low-credit alerts work.", href: "/platform/ai" },
    { ok: budget.lowBalanceCredits !== null, label: "Low-credit alert set", fix: "Set a low balance alert level.", href: "/platform/ai#alerts" },
  ];
  const left = items.filter((i) => !i.ok);
  if (left.length === 0) return null;

  return (
    <section className="card mt-6 p-5" aria-labelledby="launch">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="launch" className="text-lg font-medium">
          Ready for customers?
        </h2>
        <p className="text-sm text-muted">
          {items.length - left.length} of {items.length} done{isProduction() ? "" : " · development server"}
        </p>
      </div>
      <ul className="mt-3 grid gap-2 md:grid-cols-2">
        {items.map((i) => (
          <li key={i.label} className="flex items-start gap-2 text-sm">
            {i.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden /> : <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" aria-hidden />}
            <span>
              <span className={i.ok ? "text-muted" : "font-medium"}>{i.label}</span>
              <span className="sr-only">{i.ok ? " (done)" : " (to do)"}</span>
              {!i.ok ? (
                <>
                  {" "}
                  <Link href={i.href} className="text-xs text-primary hover:underline">
                    {i.fix}
                  </Link>
                </>
              ) : null}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
