import type { Metadata } from "next";

export const metadata: Metadata = { title: "Help & User Manual" };
export const dynamic = "force-dynamic";

import { HelpClient } from "./HelpClient";

export default function HelpPage() {
  return <HelpClient />;
}

