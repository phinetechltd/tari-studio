import type { Metadata } from "next";

import { pageMetadata } from "@/lib/seo";

import { LegalPage, Section } from "@/components/legal/legal-page";
import { OPERATOR_NAME, OPERATOR_URL, PRODUCT_NAME, SUPPORT_EMAIL } from "@/lib/brand";

export const metadata: Metadata = pageMetadata({
  title: "Privacy policy",
  description: `How ${PRODUCT_NAME}, managed by ${OPERATOR_NAME}, collects, uses and protects personal data.`,
  path: "/privacy",
  siteName: PRODUCT_NAME,
});
export const dynamic = "force-static";

/**
 * The privacy policy. Written for the Kenya Data Protection Act, 2019. It
 * describes what the platform actually does today; keep it in step with the
 * code when data handling changes, and have counsel review it before launch.
 */
export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy policy" updated="4 October 2026">
      <p>
        {PRODUCT_NAME} (&ldquo;we&rdquo;, &ldquo;the service&rdquo;) is managed by{" "}
        <a href={OPERATOR_URL} target="_blank" rel="noopener noreferrer">
          {OPERATOR_NAME}
        </a>
        , a company in Kenya, which is the data controller for the information described here. This policy explains what we collect, why, who we share it with and what
        choices you have. We follow the Kenya Data Protection Act, 2019.
      </p>

      <Section title="What we collect">
        <ul>
          <li>
            <strong>Account details:</strong> your name, email address, optional phone number, and a password stored only as a salted hash. If you sign in with Google we receive your
            name, email address and Google account identifier.
          </li>
          <li>
            <strong>Team details:</strong> the teams you create or join, your role in each, and the people you invite (their email address and role).
          </li>
          <li>
            <strong>What you make and send:</strong> prompts, briefs, images you upload (templates and characters), generated images and videos, campaigns, tracked links, posts and
            WhatsApp conversations you connect.
          </li>
          <li>
            <strong>Orders and payments:</strong> for a done-for-you order, your name, phone number, optional email and business name, and the brief. For payments we keep the
            amount, status and the receipt reference from M-Pesa or Paystack. We never see or store your M-Pesa PIN or card number.
          </li>
          <li>
            <strong>Technical data:</strong> sign-in times, security events (failed sign-ins, password changes), and the address your device used, kept in audit and rate-limit
            records so we can protect accounts.
          </li>
        </ul>
      </Section>

      <Section title="Why we use it">
        <ul>
          <li>To create your account, sign you in and keep it secure (including one-time codes and password recovery by email or SMS).</li>
          <li>To provide the service: generate media, publish posts, answer messages, track which ad led to a sale, and produce your reports.</li>
          <li>To take payment, issue receipts and prevent fraud.</li>
          <li>To contact you about your account, orders and security, and to give support.</li>
        </ul>
        <p>Our lawful bases are performing our contract with you, our legitimate interest in running a secure service, compliance with the law, and your consent where we ask for it.</p>
      </Section>

      <Section title="Who we share it with">
        <p>We use service providers (processors) only to run the service. They receive just what they need:</p>
        <ul>
          <li>Safaricom (M-Pesa Daraja) and Paystack, to collect payments.</li>
          <li>AI providers, to generate images, video and text from your prompts and uploaded reference material.</li>
          <li>Meta (Facebook, Instagram, WhatsApp), only for the accounts you connect.</li>
          <li>Bonga SMS and our email provider, to send one-time codes and notifications.</li>
          <li>Google, if you choose Google sign-in.</li>
          <li>Our hosting provider, which stores the database and uploaded files.</li>
        </ul>
        <p>We do not sell personal data. We disclose it to authorities only when the law requires.</p>
      </Section>

      <Section title="International transfers">
        <p>
          Some providers process data outside Kenya. Where that happens we rely on appropriate safeguards, such as contractual protections, as required by the Data Protection Act.
        </p>
      </Section>

      <Section title="How long we keep it">
        <p>
          We keep account and team data while your account is active. Payment and order records are kept for the period tax and accounting law requires. Security logs are kept
          for a limited time. When you ask us to delete your account we remove or anonymise your personal data, except records we must keep by law.
        </p>
      </Section>

      <Section title="Security">
        <p>
          Passwords are hashed, secrets such as provider keys are encrypted, sessions use secure cookies, sign-in and one-time-code attempts are rate-limited, and two-factor
          authentication is available. No system is perfectly secure; if a breach affects you we will tell you and the Data Commissioner as the law requires.
        </p>
      </Section>

      <Section title="Your rights">
        <p>
          You may ask to see, correct, delete or move your personal data, to object to or restrict some uses, and to withdraw consent. Write to{" "}
          <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>. We answer within the time the law allows. You may also complain to the Office of the Data Protection
          Commissioner of Kenya.
        </p>
      </Section>

      <Section title="Cookies">
        <p>
          We use only the cookies the service needs to work. See the <a href="/cookies">cookie policy</a>.
        </p>
      </Section>

      <Section title="Children">
        <p>The service is for businesses and is not directed at children under 18. We do not knowingly collect their data.</p>
      </Section>

      <Section title="Changes and contact">
        <p>
          We will update this page when our practices change and show the date above. Questions: <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>, {OPERATOR_NAME},{" "}
          <a href={OPERATOR_URL} target="_blank" rel="noopener noreferrer">
            phinetech.co.ke
          </a>
          .
        </p>
      </Section>
    </LegalPage>
  );
}
