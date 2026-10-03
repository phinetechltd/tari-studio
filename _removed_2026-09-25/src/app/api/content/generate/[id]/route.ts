import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { checkRateLimit, withOrganizationMemberRequest } from "@/lib/rbac";
import { auditAs } from "@/lib/audit";
import { db } from "@/lib/db";
import { checkContentGenerationLimit } from "@/lib/limits";
import { generateContent, getServiceConfigured } from "@/server/higgsfield";
import { generateAi } from "@/server/ai";
import { createAssetSchema } from "@/lib/validators";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const asset = await withOrganizationMemberRequest(
    session,
    async (orgId, membership, principal) => {
      const asset = await db.generatedAsset.findUnique({
        where: { id },
        include: { creator: { select: { id: true, name: true, email: true } } },
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

  return asset;
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

  // Check quota first
  const quotaResult = await checkContentGenerationLimit(session.user.id);
  if (!quotaResult.ok) {
    return NextResponse.json(quotaResult.body, { status: quotaResult.status });
  }

  const body = await request.json();
  const validation = createAssetSchema.safeParse(body);
  if (!validation.success) {
    return NextResponse.json(
      { error: "Invalid input", details: validation.error.flatten() },
      { status: 400 }
    );
  }

  const { prompt, model, mediaType, aspectRatio, seed, duration, motion, resolution } = validation.data;

  const result = await withOrganizationMemberRequest(
    session,
    async (orgId, membership, principal) => {
      if (mediaType === "VIDEO" && principal.enabledModules.has("AI_VIDEO_GENERATION") === false) {
        return NextResponse.json({ error: "AI_VIDEO_GENERATION module required" }, { status: 403 });
      }

      const asset = await db.generatedAsset.create({
        data: {
          organizationId: orgId,
          status: "GENERATING",
          mediaType,
          model,
          prompt,
          requestId: `req_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
          createdById: session.user.id,
          ...(seed !== undefined && { seed }),
          ...(aspectRatio !== undefined && { aspectRatio }),
          ...(duration !== undefined && { duration }),
          ...(motion !== undefined && { motion }),
          ...(resolution !== undefined && { resolution }),
        },
      });

      await auditAs(principal, "CONTENT_GENERATE_STARTED", "GeneratedAsset", asset.id, {
        mediaType,
        model,
        prompt: prompt.slice(0, 200),
      });

      let generatedAsset;
      try {
        const result = await generateContent({
          mediaType,
          model,
          prompt,
          aspectRatio,
          seed,
          duration,
          motion,
          resolution,
        });

        if (result.status === "FAILED") {
          await db.generatedAsset.update({
            where: { id: asset.id },
            data: {
              status: "FAILED",
              failedAt: new Date(),
              metadata: { error: result.error },
            },
          });

          await auditAs(principal, "CONTENT_GENERATE_FAILED", "GeneratedAsset", asset.id, {
            error: result.error,
          });

          return NextResponse.json(
            { asset: { id: asset.id, status: "FAILED", error: result.error } },
            { status: 202 }
          );
        }

        generatedAsset = await db.generatedAsset.update({
          where: { id: asset.id },
          data: {
            status: "READY",
            url: result.url,
            thumbnailUrl: result.thumbnailUrl,
            fileSizeBytes: result.fileSizeBytes,
            mimeType: result.mimeType,
            metadata: result.metadata,
            externalRequestId: result.requestId,
            readyAt: new Date(),
          },
        });
      } catch (err: any) {
        await db.generatedAsset.update({
          where: { id: asset.id },
          data: {
            status: "FAILED",
            failedAt: new Date(),
            metadata: { error: err.message },
          },
        });

        return NextResponse.json(
          { asset: { id: asset.id, status: "FAILED", error: err.message } },
          { status: 502 }
        );
      }

      await auditAs(principal, "CONTENT_GENERATE_COMPLETED", "GeneratedAsset", generatedAsset.id, {
        mediaType: generatedAsset.mediaType,
        model: generatedAsset.model,
        url: generatedAsset.url,
      });

      return NextResponse.json({ asset: generatedAsset });
    },
    { requiredModules: ["AI_CONTENT", "AI_IMAGE_GENERATION"] }
  );

  return result;
}
