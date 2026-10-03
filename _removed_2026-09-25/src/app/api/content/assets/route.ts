import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { withOrganizationMemberRequest } from "@/lib/rbac";
import { db } from "@/lib/db";

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const searchParams = new URL(request.url).searchParams;
  const status = searchParams.get("status") || undefined;
  const mediaType = searchParams.get("mediaType") || undefined;
  const brandId = searchParams.get("brandId") || undefined;
  const page = parseInt(searchParams.get("page") || "1", 10);
  const limit = parseInt(searchParams.get("limit") || "50", 10);

  const result = await withOrganizationMemberRequest(
    session,
    async (orgId, membership, principal) => {
      const where: any = { organizationId: orgId };
      if (status) where.status = status;
      if (mediaType) where.mediaType = mediaType;
      if (brandId) where.brandId = brandId;

      const [assets, total] = await Promise.all([
        db.generatedAsset.findMany({
          where,
          include: {
            creator: { select: { id: true, name: true, email: true } },
            brand: { select: { id: true, name: true, slug: true } },
          },
          orderBy: { createdAt: "desc" },
          skip: (page - 1) * limit,
          take: limit,
        }),
        db.generatedAsset.count({ where }),
      ]);

      return NextResponse.json({
        assets,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      });
    },
    { requiredModules: ["AI_CONTENT", "AI_IMAGE_GENERATION"] }
  );

  return result;
}
