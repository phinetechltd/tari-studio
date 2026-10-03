-- Orders are priced by a platform admin; templates and characters. Data: quote requests become REQUESTED orders and every existing order keeps its price as the estimate.
-- AlterTable
ALTER TABLE "GeneratedAsset" ADD COLUMN     "campaignId" TEXT;
-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "adminNote" TEXT,
ADD COLUMN     "pricedAt" TIMESTAMP(3),
ADD COLUMN     "pricedById" TEXT,
ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'PUBLIC',
ADD COLUMN     "submittedAt" TIMESTAMP(3),
ADD COLUMN     "suggestedCents" INTEGER NOT NULL DEFAULT 0,
ALTER COLUMN "status" SET DEFAULT 'REQUESTED';
-- CreateTable
CREATE TABLE "Template" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT,
    "promptHint" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Template_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "TemplateImage" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "fileSizeBytes" INTEGER NOT NULL,
    "caption" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TemplateImage_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "Character" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "brandId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "source" TEXT NOT NULL DEFAULT 'UPLOAD',
    "createdById" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Character_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "CharacterImage" (
    "id" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "fileSizeBytes" INTEGER NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "assetId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CharacterImage_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "CampaignCharacter" (
    "campaignId" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CampaignCharacter_pkey" PRIMARY KEY ("campaignId","characterId")
);
-- CreateIndex
CREATE UNIQUE INDEX "Template_slug_key" ON "Template"("slug");
-- CreateIndex
CREATE INDEX "Template_status_updatedAt_idx" ON "Template"("status", "updatedAt");
-- CreateIndex
CREATE INDEX "TemplateImage_templateId_sortOrder_idx" ON "TemplateImage"("templateId", "sortOrder");
-- CreateIndex
CREATE INDEX "Character_organizationId_archivedAt_idx" ON "Character"("organizationId", "archivedAt");
-- CreateIndex
CREATE INDEX "Character_brandId_idx" ON "Character"("brandId");
-- CreateIndex
CREATE INDEX "CharacterImage_characterId_sortOrder_idx" ON "CharacterImage"("characterId", "sortOrder");
-- CreateIndex
CREATE INDEX "CampaignCharacter_characterId_idx" ON "CampaignCharacter"("characterId");
-- CreateIndex
CREATE INDEX "GeneratedAsset_campaignId_idx" ON "GeneratedAsset"("campaignId");
-- AddForeignKey
ALTER TABLE "GeneratedAsset" ADD CONSTRAINT "GeneratedAsset_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "TemplateImage" ADD CONSTRAINT "TemplateImage_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "Template"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "Character" ADD CONSTRAINT "Character_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "Character" ADD CONSTRAINT "Character_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "CharacterImage" ADD CONSTRAINT "CharacterImage_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "CampaignCharacter" ADD CONSTRAINT "CampaignCharacter_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "CampaignCharacter" ADD CONSTRAINT "CampaignCharacter_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character"("id") ON DELETE CASCADE ON UPDATE CASCADE;

UPDATE "Order" SET "suggestedCents" = "amountCents" WHERE "suggestedCents" = 0 AND "amountCents" > 0;
UPDATE "Order" SET "status" = 'REQUESTED' WHERE "status" = 'QUOTE_REQUESTED';
