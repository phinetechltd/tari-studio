import { redirect } from "next/navigation";

import { requirePermission } from "@/lib/session";

/** The old generation form lives on as the Video Studio's chat. */
export default async function GenerateRedirect() {
  await requirePermission("ai:generate");
  redirect("/content");
}
