import type { Metadata } from "next";

import { PRODUCT_NAME as SEO_PRODUCT } from "@/lib/brand";
import { pageMetadata } from "@/lib/seo";
import Link from "next/link";
import { redirect } from "next/navigation";

import { AuthShell } from "@/components/auth/auth-shell";
import { GoogleButton, OrDivider } from "@/components/auth/google-button";
import { getAccountSession } from "@/lib/auth";
import { googleEnabled } from "@/server/oauth-google";

import { SignupForm } from "./signup-form";

export const metadata: Metadata = pageMetadata({
  title: "Create your account",
  description: `Start free with ${SEO_PRODUCT}: make AI video and image ads, publish them and answer customers on WhatsApp. No card needed to start.`,
  path: "/signup",
  siteName: SEO_PRODUCT,
});
export const dynamic = "force-dynamic";

export default async function SignupPage() {
  if (await getAccountSession()) redirect("/app");
  const google = googleEnabled();
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
      {google ? (
        <>
          <GoogleButton label="Sign up with Google" />
          <OrDivider />
        </>
      ) : null}
      <SignupForm />
    </AuthShell>
  );
}
