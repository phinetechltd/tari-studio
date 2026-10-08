import type { Metadata } from "next";
import type { ReactNode } from "react";

import { ConsoleShell } from "@/components/console-shell";
import { requireSession } from "@/lib/session";
import { NOINDEX } from "@/lib/seo";

/** Signed-in pages never belong in search results. */
export const metadata: Metadata = NOINDEX;

// This layout renders the shell for a signed-in user. It is NOT what protects
// the pages: Next renders layouts and pages independently, so every page below
// calls its own guard (enforced by scripts/check-permissions.mjs).
export default async function ConsoleLayout({ children }: { children: ReactNode }) {
  const { principal, claims } = await requireSession();
  return (
    <ConsoleShell principal={principal} userName={claims.name}>
      {children}
    </ConsoleShell>
  );
}
