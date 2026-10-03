import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionPrincipal } from "@/lib/auth";

export const metadata: Metadata = { title: "Organisations" };

export default async function OrgsPage() {
  const principal = await getSessionPrincipal();
  if (!principal) redirect("/login");
  redirect("/platform");
}
