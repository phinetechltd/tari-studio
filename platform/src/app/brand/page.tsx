import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionPrincipal } from "@/lib/auth";

export const metadata: Metadata = { title: "Brand Management" };

export default async function BrandManagementPage() {
  const principal = await getSessionPrincipal();
  if (!principal) redirect("/login");
  redirect("/app/brands");
}
