import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { withOrganizationMemberRequest } from "@/lib/rbac";
import { db } from "@/lib/db";
import { auditAs } from "@/lib/audit";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const result = await withOrganizationMemberRequest(
    session,
    async (orgId, membership, principal) => {
      const asset = await db.generatedAsset.findUnique({
        where: { id },
        include: {
          creator: { select: { id: true, name: true, email: true } },
          brand: { select: { id: true, name: true, slug: true } },
        },
      });

      if (!asset) {
        return NextResponse.json({ error: "Asset not found" }, { status: 404 });
      }
      if (asset.organizationId !== orgId) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }

      return NextResponse.json({ asset });
    },
    { requiredModules: ["AI_CONTENT", "AI_IMAGE_GENERATION"] }
  );

  return result;
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json();

  const result = await withOrganizationMemberRequest(
    session,
    async (orgId, membership, principal) => {
      const asset = await db.generatedAsset.findUnique({ where: { id } });
      if (!asset || asset.organizationId !== orgId) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }

      const { prompt, title } = body;
      const updated = await db.generatedAsset.update({
        where: { id },
        data: {
          ...(prompt !== undefined && { prompt }),
        },
      });

      await auditAs(principal, "ASSET_UPDATED", "GeneratedAsset", id, {
        prompt: prompt ? prompt.slice(0, 100) : undefined,
      });

      return NextResponse.json({ asset: updated });
    },
    { requiredModules: ["AI_CONTENT", "AI_IMAGE_GENERATION"] }
  );

  return result;
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const result = await withOrganizationMemberRequest(
    session,
    async (orgId, membership, principal) => {
      const asset = await db.generatedAsset.findUnique({ where: { id } });
      if (!asset || asset.organizationId !== orgId) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }

      await db.generatedAsset.delete({ where: { id } });
      await auditAs(principal, "ASSET_DELETED", "GeneratedAsset", id, {});

      return new NextResponse(null, { status: 204 });
    },
    { requiredModules: ["AI_CONTENT", "AI_IMAGE_GENERATION"] }
  );

  return result;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const url = new URL(request.url);
  const download = url.pathname.includes("/download");

  if (download) {
    const asset = await withOrganizationMemberRequest(
      session,
      async (orgId, membership, principal) => {
        const asset = await db.generatedAsset.findUnique({ where: { id } });
        if (!asset || asset.organizationId !== orgId) {
          return NextResponse.json({ error: "Not found" }, { status: 404 });
        }

        if (!asset.url) {
          return NextResponse.json({ error: "No file available" }, { status: 404 });
        }

        const fileRes = await fetch(asset.url);
        if (!fileRes.ok) {
          return NextResponse.json({ error: "Download failed" }, { status: 502 });
        }

        const blob = await fileRes.blob();
        const bytes = new Uint8Array(await blob.arrayBuffer());
        const ext = asset.mimeType?.startsWith("image/") ? ".png" : ".mp4";
        const filename = `asset-${asset.id.slice(0, 8)}${ext}`;

        return new NextResponse(bytes, {
          headers: {
            "Content-Type": asset.mimeType || "application/octet-stream",
            "Content-Disposition": `attachment; filename="${filename}"`,
            "Content-Length": bytes.length.toString(),
          },
        });
      },
      { requiredModules: ["AI_CONTENT", "AI_IMAGE_GENERATION"] }
    );

    return url.pathname.includes("/download") ? asset : NextResponse.json({ error: "Invalid" }, { status: 400 });
  }

  return NextResponse.json({ error: "Method not allowed" }, { status: 405 });
}
