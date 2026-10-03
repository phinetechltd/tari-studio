import Link from "next/link";

import { Hint } from "@/components/hints/hint";
import { MediaLibrary } from "@/components/studio/media-library";
import type { AssetView } from "@/components/studio/types";
import { PageHeader } from "@/components/ui";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/session";
import { assetView } from "@/server/generation";

export const dynamic = "force-dynamic";
export const metadata = { title: "Media library" };

export default async function MediaLibraryPage() {
  const { organizationId } = await requirePermission("ai:generate");
  const rows = await db.generatedAsset.findMany({
    where: { organizationId, archivedAt: null },
    orderBy: { createdAt: "desc" },
    take: 48,
  });

  return (
    <>
      <PageHeader
        title="Media library"
        subtitle="Every image and video your team has generated."
        actions={
          <Link href="/content" className="btn-primary">
            Open the Video Studio
          </Link>
        }
      />
      <Hint id="library.intro" title="Everything you make lands here">
        Download a file, animate an image into a clip, or extend a video. Archived items leave the list but stay in your credit history.
      </Hint>
      <MediaLibrary initial={rows.map(assetView) as AssetView[]} />
    </>
  );
}
