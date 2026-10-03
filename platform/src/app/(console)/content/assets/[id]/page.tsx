import { Download } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { SaveAsCharacter } from "@/components/characters/save-as-character";
import { ShowcaseToggle } from "@/components/content/showcase-toggle";
import { Badge, PageHeader } from "@/components/ui";
import { db } from "@/lib/db";
import { can } from "@/lib/rbac";
import { requirePermission } from "@/lib/session";
import { assetView } from "@/server/generation";

export const dynamic = "force-dynamic";
export const metadata = { title: "Media" };

const MODE_LABEL: Record<string, string> = {
  image: "Image from a prompt",
  video: "Video from a prompt",
  animate: "Animated from an image",
  extend: "Extended from a clip",
};

export default async function AssetPage({ params }: { params: Promise<{ id: string }> }) {
  const { organizationId, principal } = await requirePermission("ai:generate");
  const { id } = await params;
  const row = await db.generatedAsset.findFirst({
    where: { id, organizationId },
    include: {
      creator: { select: { name: true } },
      thread: { select: { id: true, title: true } },
      order: { select: { id: true, number: true } },
      parent: { select: { id: true, prompt: true } },
    },
  });
  if (!row) notFound();
  const a = assetView(row);
  const me = await db.user.findUnique({ where: { id: principal.userId }, select: { isPlatformAdmin: true } });

  return (
    <>
      <PageHeader
        title={a.mediaType === "VIDEO" ? "Video" : "Image"}
        subtitle={MODE_LABEL[a.mode] ?? undefined}
        actions={
          <div className="relative flex gap-2">
            {a.status === "READY" && a.mediaType === "IMAGE" && can(principal, "character:write") && (
              <SaveAsCharacter assetId={row.id} suggestedDescription={a.prompt} />
            )}
            {row.thread && (
              <Link href={`/content?project=${row.thread.id}`} className="btn-quiet">
                Open project
              </Link>
            )}
            {a.fileUrl && (
              <a href={`${a.fileUrl}?download=1`} className="btn-primary">
                <Download className="h-4 w-4" /> Download
              </a>
            )}
          </div>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="card overflow-hidden bg-neutral-950">
          {a.status === "READY" && a.fileUrl ? (
            a.mediaType === "VIDEO" ? (
              <video src={a.fileUrl} controls playsInline preload="metadata" className="max-h-[75vh] w-full" />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={a.fileUrl} alt={a.prompt} className="max-h-[75vh] w-full object-contain" />
            )
          ) : (
            <div className="flex aspect-video items-center justify-center p-6 text-center text-sm text-ink/70">
              {a.status === "GENERATING" ? "Still generating. This page shows the file when it is ready." : (a.error ?? "This generation failed.")}
            </div>
          )}
        </div>

        <div className="space-y-4">
        <dl className="card space-y-4 p-5 text-sm">
          <div>
            <dt className="text-muted">Status</dt>
            <dd className="mt-1">
              <Badge tone={a.status === "READY" ? "success" : a.status === "FAILED" ? "danger" : "info"}>{a.status.toLowerCase()}</Badge>
              {row.archivedAt && <span className="ml-2"><Badge>removed from library</Badge></span>}
            </dd>
          </div>
          <div>
            <dt className="text-muted">Prompt</dt>
            <dd className="mt-1 whitespace-pre-wrap text-ink">{a.prompt}</dd>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <dt className="text-muted">Shape</dt>
              <dd className="text-ink">{a.aspectRatio ?? "-"}</dd>
            </div>
            <div>
              <dt className="text-muted">{a.mediaType === "VIDEO" ? "Length" : "Resolution"}</dt>
              <dd className="text-ink">{a.mediaType === "VIDEO" ? `${a.durationSeconds ?? "?"} s` : (row.resolution ?? "-")}</dd>
            </div>
            <div>
              <dt className="text-muted">Credits</dt>
              <dd className="text-ink">{a.tokensCharged}</dd>
            </div>
            <div>
              <dt className="text-muted">Downloads</dt>
              <dd className="text-ink">{a.downloadCount}</dd>
            </div>
          </div>
          <div>
            <dt className="text-muted">Made by</dt>
            <dd className="text-ink">
              {row.creator.name}, {row.createdAt.toLocaleString("en-KE", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Nairobi" })}
            </dd>
          </div>
          {row.parent && (
            <div>
              <dt className="text-muted">Made from</dt>
              <dd>
                <Link href={`/content/assets/${row.parent.id}`} className="text-primary underline">
                  {row.parent.prompt.slice(0, 80)}
                </Link>
              </dd>
            </div>
          )}
          {row.order && (
            <div>
              <dt className="text-muted">For order</dt>
              <dd>
                <Link href={`/app/orders/${row.order.id}`} className="text-primary underline">
                  {row.order.number}
                </Link>
              </dd>
            </div>
          )}
          <div>
            <dt className="text-muted">Model</dt>
            <dd className="break-all text-xs text-muted">{row.model}</dd>
          </div>
        </dl>
        {me?.isPlatformAdmin && a.status === "READY" && !row.archivedAt ? (
          <ShowcaseToggle assetId={row.id} initial={row.showcase} initialTitle={row.showcaseTitle} />
        ) : null}
        </div>
      </div>
    </>
  );
}
