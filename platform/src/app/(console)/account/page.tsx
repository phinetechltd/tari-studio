import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader, SectionTitle } from "@/components/ui";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/session";
import { preferencesFor } from "@/server/notify";

import { GuideSwitch, PasswordForm, PhoneVerify } from "@/components/account/security-forms";

import { PreferencesForm, ProfileForm, TipsForm } from "./account-forms";

export const metadata: Metadata = { title: "Profile" };
export const dynamic = "force-dynamic";

/** The signed-in person's own settings: profile, notifications, tips. Two-factor lives on Security. */
export default async function AccountPage() {
  const { principal } = await requireSession();
  const [user, prefs] = await Promise.all([
    db.user.findUniqueOrThrow({ where: { id: principal.userId }, select: { name: true, email: true, phone: true, hintsEnabled: true, dismissedHints: true, hasPassword: true, phoneVerifiedAt: true, setupGuideOff: true } }),
    preferencesFor(principal.userId, principal.organizationId),
  ]);

  return (
    <>
      <PageHeader
        title="Profile"
        subtitle="Your name, how notifications reach you, and tips."
        actions={
          <Link href="/security" className="btn-quiet">
            Two-factor and sign-in
          </Link>
        }
      />

      <section aria-labelledby="profile">
        <SectionTitle id="profile">You</SectionTitle>
        <ProfileForm name={user.name} email={user.email} phone={user.phone} />
      </section>

      <section className="mt-10" aria-labelledby="phone">
        <SectionTitle id="phone">Confirm your phone</SectionTitle>
        <PhoneVerify phone={user.phone} verified={user.phoneVerifiedAt != null} />
      </section>

      <section className="mt-10" aria-labelledby="password">
        <SectionTitle id="password">Password</SectionTitle>
        <PasswordForm hasPassword={user.hasPassword} />
      </section>

      <section className="mt-10 scroll-mt-20" id="notifications" aria-labelledby="notifications-title">
        <SectionTitle id="notifications-title">Notifications</SectionTitle>
        <p className="-mt-2 mb-4 max-w-2xl text-sm text-muted">
          Everything shows on the bell. Choose what also comes by email or SMS{principal.organizationId ? " for this organisation" : ""}. Account and money matters are always sent.
        </p>
        <PreferencesForm events={prefs.events} hasPhone={Boolean(prefs.phone)} smsOn={prefs.smsOn} />
      </section>

      <section className="mt-10" aria-labelledby="tips">
        <SectionTitle id="tips">Tips</SectionTitle>
        <TipsForm enabled={user.hintsEnabled} dismissed={user.dismissedHints.length} />
        <div className="mt-4">
          <GuideSwitch off={user.setupGuideOff} />
        </div>
      </section>
    </>
  );
}
