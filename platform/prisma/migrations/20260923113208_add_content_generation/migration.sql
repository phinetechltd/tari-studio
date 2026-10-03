/*
  Warnings:

  - You are about to drop the column `content` on the `ContentSubmission` table. All the data in the column will be lost.
  - You are about to drop the column `fileSize` on the `ContentSubmission` table. All the data in the column will be lost.
  - You are about to drop the column `fileType` on the `ContentSubmission` table. All the data in the column will be lost.
  - You are about to drop the column `fileUrl` on the `ContentSubmission` table. All the data in the column will be lost.
  - You are about to drop the column `notes` on the `ContentSubmission` table. All the data in the column will be lost.
  - You are about to drop the column `stage` on the `ContentSubmission` table. All the data in the column will be lost.
  - Added the required column `organizationId` to the `ContentSubmission` table without a default value. This is not possible if the table is not empty.
  - Made the column `title` on table `ContentSubmission` required. This step will fail if there are existing NULL values in that column.

*/
-- DropForeignKey
ALTER TABLE "Brand" DROP CONSTRAINT "Brand_createdById_fkey";

-- DropForeignKey
ALTER TABLE "ContentSubmission" DROP CONSTRAINT "ContentSubmission_taskId_fkey";

-- DropIndex
DROP INDEX "ContentSubmission_taskId_stage_idx";

-- AlterTable
ALTER TABLE "Brand" ALTER COLUMN "createdById" DROP NOT NULL;

-- AlterTable
ALTER TABLE "ContentSubmission" DROP COLUMN "content",
DROP COLUMN "fileSize",
DROP COLUMN "fileType",
DROP COLUMN "fileUrl",
DROP COLUMN "notes",
DROP COLUMN "stage",
ADD COLUMN     "aiMetadata" JSONB,
ADD COLUMN     "altText" TEXT,
ADD COLUMN     "aspectRatio" TEXT,
ADD COLUMN     "assetId" TEXT,
ADD COLUMN     "caption" TEXT,
ADD COLUMN     "description" TEXT,
ADD COLUMN     "organizationId" TEXT NOT NULL,
ADD COLUMN     "reviewedAt" TIMESTAMP(3),
ADD COLUMN     "reviewedById" TEXT,
ADD COLUMN     "reviewerNotes" TEXT,
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'DRAFT',
ALTER COLUMN "taskId" DROP NOT NULL,
ALTER COLUMN "title" SET NOT NULL;

-- CreateTable
CREATE TABLE "GeneratedAsset" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "brandId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "mediaType" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "url" TEXT,
    "thumbnailUrl" TEXT,
    "fileSizeBytes" INTEGER,
    "mimeType" TEXT,
    "metadata" JSONB,
    "requestId" TEXT NOT NULL,
    "externalRequestId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readyAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "downloadCount" INTEGER NOT NULL DEFAULT 0,
    "lastDownloadedAt" TIMESTAMP(3),

    CONSTRAINT "GeneratedAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Post" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "externalChannelId" TEXT,
    "submissionId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "caption" TEXT NOT NULL,
    "mediaUrls" JSONB NOT NULL DEFAULT '[]',
    "altTexts" JSONB NOT NULL DEFAULT '[]',
    "linkUrl" TEXT,
    "utmParams" JSONB,
    "scheduledAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "externalPostId" TEXT,
    "externalUrl" TEXT,
    "metrics" JSONB,
    "error" TEXT,
    "createdById" TEXT NOT NULL,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "aiMetadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Post_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GeneratedAsset_requestId_key" ON "GeneratedAsset"("requestId");

-- CreateIndex
CREATE INDEX "GeneratedAsset_organizationId_idx" ON "GeneratedAsset"("organizationId");

-- CreateIndex
CREATE INDEX "GeneratedAsset_brandId_idx" ON "GeneratedAsset"("brandId");

-- CreateIndex
CREATE INDEX "GeneratedAsset_status_idx" ON "GeneratedAsset"("status");

-- CreateIndex
CREATE INDEX "GeneratedAsset_mediaType_idx" ON "GeneratedAsset"("mediaType");

-- CreateIndex
CREATE INDEX "GeneratedAsset_createdById_idx" ON "GeneratedAsset"("createdById");

-- CreateIndex
CREATE INDEX "GeneratedAsset_organizationId_status_mediaType_idx" ON "GeneratedAsset"("organizationId", "status", "mediaType");

-- CreateIndex
CREATE INDEX "Post_organizationId_idx" ON "Post"("organizationId");

-- CreateIndex
CREATE INDEX "Post_brandId_idx" ON "Post"("brandId");

-- CreateIndex
CREATE INDEX "Post_channel_idx" ON "Post"("channel");

-- CreateIndex
CREATE INDEX "Post_status_idx" ON "Post"("status");

-- CreateIndex
CREATE INDEX "Post_scheduledAt_idx" ON "Post"("scheduledAt");

-- CreateIndex
CREATE INDEX "Post_submissionId_idx" ON "Post"("submissionId");

-- CreateIndex
CREATE UNIQUE INDEX "Post_organizationId_submissionId_key" ON "Post"("organizationId", "submissionId");

-- CreateIndex
CREATE INDEX "ContentSubmission_organizationId_idx" ON "ContentSubmission"("organizationId");

-- CreateIndex
CREATE INDEX "ContentSubmission_status_idx" ON "ContentSubmission"("status");

-- CreateIndex
CREATE INDEX "ContentSubmission_assetId_idx" ON "ContentSubmission"("assetId");

-- CreateIndex
CREATE INDEX "ContentSubmission_createdById_idx" ON "ContentSubmission"("createdById");

-- AddForeignKey
ALTER TABLE "Brand" ADD CONSTRAINT "Brand_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentSubmission" ADD CONSTRAINT "ContentSubmission_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "GeneratedAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentSubmission" ADD CONSTRAINT "ContentSubmission_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "ContentTask"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentSubmission" ADD CONSTRAINT "ContentSubmission_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentSubmission" ADD CONSTRAINT "ContentSubmission_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GeneratedAsset" ADD CONSTRAINT "GeneratedAsset_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GeneratedAsset" ADD CONSTRAINT "GeneratedAsset_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GeneratedAsset" ADD CONSTRAINT "GeneratedAsset_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Post" ADD CONSTRAINT "Post_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Post" ADD CONSTRAINT "Post_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Post" ADD CONSTRAINT "Post_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "ContentSubmission"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Post" ADD CONSTRAINT "Post_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Post" ADD CONSTRAINT "Post_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
