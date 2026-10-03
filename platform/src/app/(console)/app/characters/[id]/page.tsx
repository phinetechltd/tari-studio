import type { Metadata } from "next";
import Link from "next/link";

import { CharacterForm } from "@/components/characters/character-form";
import { Badge, PageHeader } from "@/components/ui";
import { db } from "@/lib/db";
import { can } from "@/lib/rbac";
import { requirePermission } from "@/lib/session";
import { getCharacter } from "@/server/characters";

export const metadata: Metadata = { title: "Character" };
export const dynamic = "force-dynamic";

export default async function CharacterPage({ params }: { params: Promise<{ id: string }> }) {
  const { principal, organizationId } = await requirePermission("character:read");
  const { id } = await params;
  const c = await getCharacter(principal, id);
  const canWrite = can(principal, "character:write");
  const brands = await db.brand.findMany({ where: { organizationId }, orderBy: { name: "asc" }, select: { id: true, name: true } });

  return (
    <>
      <Link href="/app/characters" className="mb-3 inline-flex text-sm text-muted hover:text-ink">
        All characters
      </Link>
      <PageHeader
        title={c.name}
        subtitle={c.source === "GENERATED" ? "Kept from a generated image" : "Uploaded"}
        actions={c.archived ? <Badge tone="neutral">Archived</Badge> : null}
      />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        {canWrite ? (
          <CharacterForm initial={{ id: c.id, name: c.name, description: c.description, brandId: c.brandId ?? "", archived: c.archived, images: c.images }} brands={brands} />
        ) : (
          <section className="card p-5">
            <p className="whitespace-pre-wrap text-sm text-ink">{c.description || "No description."}</p>
            <ul className="mt-4 grid grid-cols-3 gap-3">
              {c.images.map((img) => (
                <li key={img.id} className="overflow-hidden rounded-xl border border-line">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={img.url} alt={c.name} className="aspect-square w-full object-cover" loading="lazy" />
                </li>
              ))}
            </ul>
          </section>
        )}
        <aside className="space-y-6">
          <section className="card p-5 text-sm">
            <h2 className="font-semibold text-ink">Use in the Studio</h2>
            <p className="mt-2 text-muted">Pick this character in the Studio and their name and description go into your prompt.</p>
            <Link href={`/content?character=${c.id}`} className="btn-primary mt-3">
              Make something with {c.name}
            </Link>
          </section>
          <section className="card p-5 text-sm">
            <h2 className="font-semibold text-ink">In campaigns</h2>
            {c.campaigns.length === 0 ? (
              <p className="mt-2 text-muted">Not in a campaign yet. Add them from a campaign&apos;s page.</p>
            ) : (
              <ul className="mt-2 space-y-1">
                {c.campaigns.map((cp) => (
                  <li key={cp.id}>
                    <Link href={`/app/campaigns/${cp.id}`} className="text-primary hover:underline">
                      {cp.name}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>
      </div>
    </>
  );
}
