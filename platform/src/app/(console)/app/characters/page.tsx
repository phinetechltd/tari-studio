import { Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { EmptyState, PageHeader } from "@/components/ui";
import { can } from "@/lib/rbac";
import { requirePermission } from "@/lib/session";
import { listCharacters } from "@/server/characters";

export const metadata: Metadata = { title: "Characters" };
export const dynamic = "force-dynamic";

/** The recurring faces of an agency's campaigns: mascots, models, personas. */
export default async function CharactersPage({ searchParams }: { searchParams: Promise<{ archived?: string }> }) {
  const { principal, organizationId } = await requirePermission("character:read");
  const { archived } = await searchParams;
  const showArchived = archived === "1";
  const all = await listCharacters(organizationId, { includeArchived: true });
  const characters = all.filter((c) => c.archived === showArchived);
  const canWrite = can(principal, "character:write");

  return (
    <>
      <PageHeader
        title="Characters"
        subtitle="Keep the same faces across campaigns. Add images and a description, then pick the character in the Studio."
        actions={
          canWrite ? (
            <Link href="/app/characters/new" className="btn-primary">
              <Plus className="h-4 w-4" /> New character
            </Link>
          ) : null
        }
      />
      <nav className="mb-4 flex gap-2" aria-label="Filter characters">
        <Link href="/app/characters" className={`min-h-[36px] rounded-full border px-3 py-1.5 text-sm ${!showArchived ? "border-primary bg-primary/10 text-primary" : "border-line bg-raised text-muted hover:text-ink"}`}>
          Active
        </Link>
        <Link href="/app/characters?archived=1" className={`min-h-[36px] rounded-full border px-3 py-1.5 text-sm ${showArchived ? "border-primary bg-primary/10 text-primary" : "border-line bg-raised text-muted hover:text-ink"}`}>
          Archived
        </Link>
      </nav>
      {characters.length === 0 ? (
        <EmptyState
          title={showArchived ? "Nothing archived" : "No characters yet"}
          action={!showArchived && canWrite ? <Link href="/app/characters/new" className="btn-primary">Create your first character</Link> : undefined}
        >
          {showArchived ? "Archived characters appear here." : "A character can be a mascot, a model or a persona. Upload their images or keep one you generated."}
        </EmptyState>
      ) : (
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {characters.map((c) => (
            <li key={c.id}>
              <Link href={`/app/characters/${c.id}`} className="card group block overflow-hidden transition-colors hover:border-primary/50">
                <div className="aspect-square overflow-hidden bg-surface">
                  {c.cover ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={c.cover} alt="" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" loading="lazy" />
                  ) : (
                    <div className="flex h-full items-center justify-center text-4xl font-semibold text-primary/50">{c.name.slice(0, 1)}</div>
                  )}
                </div>
                <div className="p-3">
                  <p className="font-semibold text-ink">{c.name}</p>
                  <p className="text-xs text-muted">
                    {c.images.length} image{c.images.length === 1 ? "" : "s"}
                    {c.brandName ? ` · ${c.brandName}` : ""}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
