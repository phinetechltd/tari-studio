import { Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { Badge, EmptyState, PageHeader, SectionTitle, TableWrap } from "@/components/ui";
import { requirePlatform } from "@/lib/session";
import { listAll, listShared } from "@/server/templates";

import { ModerateButton } from "./moderate-button";

export const metadata: Metadata = { title: "Templates" };
export const dynamic = "force-dynamic";

/** Templates you publish for every agency: a description and an image pack each. */
export default async function PlatformTemplatesPage() {
  await requirePlatform();
  const [templates, shared] = await Promise.all([listAll(), listShared()]);
  return (
    <>
      <PageHeader
        title="Templates"
        subtitle="Look-and-feel packs for agencies: a description and a set of images they can use in the Studio. Drafts are visible only to you."
        actions={
          <Link href="/platform/templates/new" className="btn-primary">
            <Plus className="h-4 w-4" /> New template
          </Link>
        }
      />
      {templates.length === 0 ? (
        <EmptyState title="No templates yet" action={<Link href="/platform/templates/new" className="btn-primary">Create the first template</Link>}>
          Publish a pack of images with a description and every agency can start from it.
        </EmptyState>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {templates.map((t) => (
            <li key={t.id}>
              <Link href={`/platform/templates/${t.id}`} className="card block h-full overflow-hidden transition-colors hover:border-primary/50">
                <div className="aspect-[4/3] bg-surface">
                  {t.cover ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={t.cover} alt="" className="h-full w-full object-cover" loading="lazy" />
                  ) : (
                    <div className="flex h-full items-center justify-center text-sm text-muted">No images yet</div>
                  )}
                </div>
                <div className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <h2 className="font-semibold text-ink">{t.title}</h2>
                    <Badge tone={t.status === "PUBLISHED" ? "success" : "neutral"}>{t.status === "PUBLISHED" ? "Published" : "Draft"}</Badge>
                  </div>
                  <p className="mt-1 line-clamp-2 text-sm text-muted">{t.description}</p>
                  <p className="mt-2 text-xs text-muted">
                    {t.imageCount} image{t.imageCount === 1 ? "" : "s"}
                    {t.category ? ` · ${t.category}` : ""}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <section className="mt-12" aria-labelledby="shared">
        <SectionTitle id="shared">Shared by organisations ({shared.length})</SectionTitle>
        <p className="-mt-2 mb-4 max-w-3xl text-sm text-muted">
          Public templates organisations made for everyone. They go live when published; hide any that are inappropriate or use pictures that are not theirs. A hidden template stays usable by the organisation that made it, which sees your reason.
        </p>
        {shared.length === 0 ? (
          <EmptyState title="Nothing shared yet">Public templates from organisations appear here.</EmptyState>
        ) : (
          <TableWrap>
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-muted">
                  <th className="px-4 py-2 font-medium">Template</th>
                  <th className="px-4 py-2 font-medium">Organisation</th>
                  <th className="px-4 py-2 text-right font-medium">Images</th>
                  <th className="px-4 py-2 font-medium">State</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody>
                {shared.map((t) => (
                  <tr key={t.id} className="border-b border-line last:border-0">
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-3">
                        {t.cover ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={t.cover} alt="" className="h-10 w-10 rounded-lg object-cover" loading="lazy" />
                        ) : null}
                        <Link href={`/platform/templates/${t.id}`} className="font-medium text-primary underline-offset-2 hover:underline">
                          {t.title}
                        </Link>
                      </div>
                    </td>
                    <td className="px-4 py-2 text-muted">{t.organizationName ?? "—"}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{t.imageCount}</td>
                    <td className="px-4 py-2">{t.hidden ? <Badge tone="danger">Hidden</Badge> : <Badge tone="success">Shared</Badge>}</td>
                    <td className="px-4 py-2 text-right">
                      <ModerateButton id={t.id} hidden={t.hidden} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
      </section>
    </>
  );
}
