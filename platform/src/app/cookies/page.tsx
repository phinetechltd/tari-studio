import type { Metadata } from "next";

import { LegalPage, Section } from "@/components/legal/legal-page";
import { OPERATOR_NAME, PRODUCT_NAME, SUPPORT_EMAIL } from "@/lib/brand";

export const metadata: Metadata = {
  title: "Cookie policy",
  description: `The cookies ${PRODUCT_NAME} uses, and why.`,
};
export const dynamic = "force-static";

const COOKIES = [
  { name: "ap_session", purpose: "Keeps you signed in after you log in.", kind: "Essential", lasts: "Up to 12 hours (or until you sign out)" },
  { name: "ap_theme", purpose: "Remembers whether you chose the light or dark theme.", kind: "Essential preference", lasts: "1 year" },
  { name: "oauth_state", purpose: "Protects Google sign-in from forgery while you are being redirected.", kind: "Essential", lasts: "10 minutes" },
];

export default function CookiesPage() {
  return (
    <LegalPage title="Cookie policy" updated="4 October 2026">
      <p>
        Cookies are small files a website stores in your browser. {PRODUCT_NAME}, managed by {OPERATOR_NAME}, uses a very small number, all of them needed to run the service.
        We do not use advertising or cross-site tracking cookies, and we do not load third-party analytics.
      </p>

      <Section title="Cookies we set">
        <div className="overflow-x-auto rounded-xl border border-line">
          <table className="w-full min-w-[520px] text-left text-sm">
            <thead className="bg-wash/[0.05] text-xs uppercase tracking-wider text-muted">
              <tr>
                <th className="p-3">Name</th>
                <th className="p-3">What it does</th>
                <th className="p-3">Type</th>
                <th className="p-3">Lasts</th>
              </tr>
            </thead>
            <tbody>
              {COOKIES.map((c) => (
                <tr key={c.name} className="border-t border-line align-top">
                  <td className="p-3 font-mono text-xs">{c.name}</td>
                  <td className="p-3">{c.purpose}</td>
                  <td className="p-3">{c.kind}</td>
                  <td className="p-3">{c.lasts}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="Local storage">
        <p>
          Your browser also keeps a few settings on your device, such as whether the side menu is collapsed and that you have seen the cookie notice. These never leave your
          device.
        </p>
      </Section>

      <Section title="Third parties">
        <p>
          If you pay by card or M-Pesa on Paystack&apos;s page, or sign in with Google, those companies set their own cookies on their own pages under their own policies. We do not
          control them.
        </p>
      </Section>

      <Section title="Your choices">
        <p>
          Because the cookies above are essential, the service cannot work without them; you can block them in your browser settings, but you will not be able to sign in. You can delete
          them at any time by clearing your browser data or by signing out.
        </p>
      </Section>

      <Section title="Contact">
        <p>
          Questions about cookies: <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>. More on how we handle personal data is in the <a href="/privacy">privacy policy</a>.
        </p>
      </Section>
    </LegalPage>
  );
}
