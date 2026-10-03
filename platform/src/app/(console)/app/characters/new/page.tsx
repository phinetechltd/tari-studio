import type { Metadata } from "next";
import Link from "next/link";

import { CharacterForm } from "@/components/characters/character-form";
import { PageHeader } from "@/components/ui";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/session";

export const metadata: Metadata = { title: "New character" };
export const dynamic = "force-dynamic";

export default async function NewCharacterPage() {
  const { organizationId } = await requirePermission("character:write");
  const brands = await db.brand.findMany({ where: { organizationId }, orderBy: { name: "asc" }, select: { id: true, name: true } });
  return (
    <>
      <Link href="/app/characters" className="mb-3 inline-flex text-sm text-muted hover:text-ink">
        All characters
      </Link>
      <PageHeader title="New character" subtitle="Describe them and add a few images." />
      <div className="max-w-2xl">
        <CharacterForm initial={{ name: "", description: "", brandId: "", images: [] }} brands={brands} />
      </div>
    </>
  );
}
