-- Organisation templates (private or public, hideable by a platform admin),
-- Pinterest-sourced template images with credit, TikTok refresh tokens, and
-- external sign-ins (Pinterest, TikTok Business API for comments).
-- AlterTable
ALTER TABLE "SocialChannel" ADD COLUMN     "refreshCipher" TEXT,
ADD COLUMN     "refreshExpiresAt" TIMESTAMP(3),
ADD COLUMN     "refreshIv" TEXT,
ADD COLUMN     "refreshTag" TEXT;

-- AlterTable
ALTER TABLE "Template" ADD COLUMN     "hiddenAt" TIMESTAMP(3),
ADD COLUMN     "hiddenById" TEXT,
ADD COLUMN     "hiddenReason" TEXT,
ADD COLUMN     "organizationId" TEXT,
ADD COLUMN     "visibility" TEXT NOT NULL DEFAULT 'PUBLIC';

-- AlterTable
ALTER TABLE "TemplateImage" ADD COLUMN     "sourceAuthor" TEXT,
ADD COLUMN     "sourceAuthorUrl" TEXT,
ADD COLUMN     "sourceExternalId" TEXT,
ADD COLUMN     "sourceOwned" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "sourceProvider" TEXT,
ADD COLUMN     "sourceUrl" TEXT;

-- CreateTable
CREATE TABLE "ExternalAccount" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "channelId" TEXT,
    "externalId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "handle" TEXT,
    "accessCipher" TEXT NOT NULL,
    "accessIv" TEXT NOT NULL,
    "accessTag" TEXT NOT NULL,
    "accessExpiresAt" TIMESTAMP(3),
    "refreshCipher" TEXT,
    "refreshIv" TEXT,
    "refreshTag" TEXT,
    "refreshExpiresAt" TIMESTAMP(3),
    "scopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "metadata" JSONB,
    "connectedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExternalAccount_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ExternalAccount_provider_status_idx" ON "ExternalAccount"("provider", "status");

-- CreateIndex
CREATE INDEX "ExternalAccount_channelId_idx" ON "ExternalAccount"("channelId");

-- CreateIndex
CREATE UNIQUE INDEX "ExternalAccount_organizationId_provider_externalId_key" ON "ExternalAccount"("organizationId", "provider", "externalId");

-- CreateIndex
CREATE INDEX "Template_organizationId_updatedAt_idx" ON "Template"("organizationId", "updatedAt");

-- CreateIndex
CREATE INDEX "Template_visibility_status_idx" ON "Template"("visibility", "status");

-- AddForeignKey
ALTER TABLE "Template" ADD CONSTRAINT "Template_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalAccount" ADD CONSTRAINT "ExternalAccount_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

