import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { withOrganizationMemberRequest } from "@/lib/rbac";
import { db } from "@/lib/db";
import { auditAs } from "@/lib/audit";

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const searchParams = new URL(request.url).searchParams;
  const status = searchParams.get("status") || undefined;
  const channel = searchParams.get("channel") || undefined;
  const brandId = searchParams.get("brandId") || undefined;
  const page = parseInt(searchParams.get("page") || "1", 10);
  const limit = parseInt(searchParams.get("limit") || "50", 10);

  const result = await withOrganizationMemberRequest(
    session,
    async (orgId, membership, principal) => {
      const where: any = { organizationId: orgId };
      if (status) where.status = status;
      if (channel) where.channel = channel;
      if (brandId) where.brandId = brandId;

      const [posts, total] = await Promise.all([
        db.post.findMany({
          where,
          include: {
            creator: { select: { id: true, name: true } },
            approver: { select: { id: true, name: true } },
            brand: { select: { id: true, name: true } },
            submission: { select: { id: true, title: true } },
          },
          orderBy: { createdAt: "desc" },
          skip: (page - 1) * limit,
          take: limit,
        }),
        db.post.count({ where }),
      ]);

      return NextResponse.json({
        posts,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      });
    },
    { requiredModules: ["AI_CONTENT", "AI_IMAGE_GENERATION"] }
  );

  return result;
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { submissionId, brandId, channel, externalChannelId, caption, mediaUrls, altTexts, linkUrl, utmParams, scheduledAt } = body;

  const result = await withOrganizationMemberRequest(
    session,
    async (orgId, membership, principal) => {
      if (!brandId || !channel || !caption) {
        return NextResponse.json(
          { error: "brandId, channel, and caption are required" },
          { status: 400 }
        );
      }

      const submission = submissionId
        ? await db.contentSubmission.findUnique({ where: { id: submissionId } })
        : null;

      if (submissionId && (!submission || submission.organizationId !== orgId)) {
        return NextResponse.json({ error: "Submission not found" }, { status: 404 });
      }

      const post = await db.post.create({
        data: {
          organizationId: orgId,
          brandId,
          channel,
          externalChannelId,
          submissionId,
          caption,
          mediaUrls: mediaUrls || (submission?.asset ? [submission.asset.url || ""] : []),
          altTexts: altTexts || [],
          linkUrl,
          utmParams,
          scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
          status: scheduledAt ? "SCHEDULED" : "DRAFT",
          createdById: session.user.id,
        },
      });

      await auditAs(principal, "POST_CREATED", "Post", post.id, {
        channel,
        brandId,
        submissionId,
        caption: caption.slice(0, 100),
      });

      return NextResponse.json({ post }, { status: 201 });
    },
    { requiredModules: ["AI_CONTENT", "AI_IMAGE_GENERATION"] }
  );

  return result;
}
