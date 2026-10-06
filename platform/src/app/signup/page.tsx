import type { Metadata } from "next";

import { PRODUCT_NAME as SEO_PRODUCT } from "@/lib/brand";
import { pageMetadata } from "@/lib/seo";
import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";

import { AuthShell } from "@/components/auth/auth-shell";
import { GoogleButton, OrDivider } from "@/components/auth/google-button";
import { TiktokButton } from "@/components/auth/tiktok-button";
import { TiktokCompleteForm } from "@/components/auth/tiktok-complete-form";
import { getAccountSession } from "@/lib/auth";
import { googleEnabled } from "@/server/oauth-google";
import { readTiktokPending, tiktokLoginEnabled, TIKTOK_PENDING_COOKIE } from "@/server/oauth-tiktok";

import { SignupForm } from "./signup-form";

export const metadata: Metadata = pageMetadata({
  title: "Create your account",
  description: `Start free with ${SEO_PRODUCT}: make AI video and image ads, publish them and answer customers on WhatsApp. No card needed to start.`,
  path: "/signup",
  siteName: SEO_PRODUCT,
});
export const dynamic = "force-dynamic";

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ tiktok?: string }> }) {
  if (await getAccountSession()) redirect("/app");
  const { tiktok } = await searchParams;
  const jar = await cookies();
  // A TikTok-authorized identity finishing its sign-up lands here with the pending ticket.
  const pending = tiktok === "1" ? await readTiktokPending(jar.get(TIKTOK_PENDING_COOKIE)?.value) : null;
  const google = googleEnabled();
  const tiktokOn = tiktokLoginEnabled();

  if (tiktok === "1" && pending) {
    return (
      <AuthShell
        title="Finish creating your account"
        subtitle={pending.name ? `Signed in with TikTok as ${pending.name}.` : "Signed in with TikTok."}
        footer={
          <>
            <Link href="/signup" className="font-medium text-primary hover:underline">
              Start over
            </Link>
          </>
        }
      >
        <TiktokCompleteForm defaultName={pending.name} />
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Create your account"
      subtitle="Free to start. You make a team next, or join one you were invited to."
      footer={
        <>
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-primary hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      {google || tiktokOn ? (
        <>
          <div className="space-y-3">
            {google ? <GoogleButton label="Sign up with Google" /> : null}
            {tiktokOn ? <TiktokButton label="Sign up with TikTok" /> : null}
          </div>
          <OrDivider />
        </>
      ) : null}
      <SignupForm />
    </AuthShell>
  );
}
