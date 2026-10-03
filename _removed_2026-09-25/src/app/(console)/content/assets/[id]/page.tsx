import { notFound } from "next/navigation";
import AssetDetailPage from "@/components/content/AssetDetailPage";
import { downloadAsset } from "@/lib/download";
import { withOrganizationMemberRequest } from "@/lib/rbac";

interface Props {
  params: Promise<{ id: string }>;
}

export const metadata = ({ params }: Props) => {
  return { title: "Asset Detail" };
};

export default async function AssetDetailPageServer({ params }: Props) {
  const { id } = await params;

  const asset = await withOrganizationMemberRequest(
    {} as any,
    async (orgId, membership, principal) => {
      const a = await prisma.generatedAsset.findUnique({
        where: { id },
        include: {
          creator: { select: { id: true, name: true, email: true } },
          brand: { select: { id: true, name: true, slug: true } },
        },
      });

      if (!a || a.organizationId !== orgId) return null;
      return JSON.parse(JSON.stringify(a));
    },
    { requiredModules: ["AI_CONTENT", "AI_IMAGE_GENERATION"] }
  ) as any;

  if (!asset) {
    notFound();
  }

  return (
    <AssetDetailPage
      asset={asset}
      onDownload={async (a) => {
        await downloadAsset(a.id);
      }}
    />
  );
}

// Need prisma import for server component
import { prisma } from "@/lib/db";
