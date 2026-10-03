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
      const post = await db.post.findUnique({
        where: { id },
        include: {
          creator: { select: { id: true, name: true } },
          approver: { select: { id: true, name: true } },
          brand: { select: { id: true, name: true } },
          submission: { select: { id: true, title: true, caption: true } },
        },
      });

      if (!post || post.organizationId !== orgId) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }

      return NextResponse.json({ post });
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
      const post = await db.post.findUnique({ where: { id } });
      if (!post || post.organizationId !== orgId) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }

      const { caption, mediaUrls, altTexts, linkUrl, utmParams, scheduledAt, status } = body;

      const updated = await db.post.update({
        where: { id },
        data: {
          ...(caption !== undefined && { caption }),
          ...(mediaUrls !== undefined && { mediaUrls }),
          ...(altTexts !== undefined && { altTexts }),
          ...(linkUrl !== undefined && { linkUrl }),
          ...(utmParams !== undefined && { utmParams }),
          ...(scheduledAt !== undefined && {
            scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
            status: scheduledAt ? "SCHEDULED" : post.status,
          }),
          ...(status !== undefined && { status }),
        },
      });

      await auditAs(principal, "POST_UPDATED", "Post", id, {
        caption: caption ? caption.slice(0, 100) : undefined,
        status,
      });

      return NextResponse.json({ post: updated });
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
      const post = await db.post.findUnique({ where: { id } });
      if (!post || post.organizationId !== orgId) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }

      await db.post.delete({ where: { id } });
      await auditAs(principal, "POST_DELETED", "Post", id, {});

      return new NextResponse(null, { status: 204 });
    },
    { requiredModules: ["AI_CONTENT", "AI_IMAGE_GENERATION"] }
  );

  return result;
}
