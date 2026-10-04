-- AlterTable
ALTER TABLE "Brand" ADD COLUMN     "coverImageKey" TEXT,
ADD COLUMN     "coverMimeType" TEXT,
ADD COLUMN     "logoKey" TEXT,
ADD COLUMN     "logoMimeType" TEXT,
ADD COLUMN     "slogan" TEXT;

-- AlterTable
ALTER TABLE "CatalogueItem" ADD COLUMN     "attributes" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "lowStockAt" INTEGER,
ADD COLUMN     "stockQty" INTEGER,
ADD COLUMN     "trackStock" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "unit" TEXT,
ADD COLUMN     "url" TEXT;

-- CreateTable
CREATE TABLE "ProductImage" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "fileSizeBytes" INTEGER NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductImage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockMovement" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "delta" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "note" TEXT,
    "balanceAfter" INTEGER NOT NULL,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BrandAttachment" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "fileSizeBytes" INTEGER NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BrandAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderFile" (
    "id" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'HIGGSFIELD',
    "url" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProviderFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Autopilot" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "mode" TEXT NOT NULL DEFAULT 'APPROVE_FIRST',
    "contentKind" TEXT NOT NULL DEFAULT 'IMAGE',
    "seconds" INTEGER,
    "aspectRatio" TEXT NOT NULL DEFAULT '1:1',
    "productIds" TEXT[],
    "characterIds" TEXT[],
    "templateId" TEXT,
    "channelIds" TEXT[],
    "guidance" TEXT NOT NULL DEFAULT '',
    "schedule" JSONB NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'Africa/Nairobi',
    "nextRunAt" TIMESTAMP(3),
    "lastRunAt" TIMESTAMP(3),
    "monthlyCreditCap" INTEGER,
    "consecutiveFailures" INTEGER NOT NULL DEFAULT 0,
    "pausedReason" TEXT,
    "rotation" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Autopilot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutopilotRun" (
    "id" TEXT NOT NULL,
    "autopilotId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "slotKey" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PLANNED',
    "assetId" TEXT,
    "postIds" TEXT[],
    "caption" TEXT,
    "reason" TEXT,
    "creditsSpent" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AutopilotRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProductImage_productId_sortOrder_idx" ON "ProductImage"("productId", "sortOrder");

-- CreateIndex
CREATE INDEX "StockMovement_productId_createdAt_idx" ON "StockMovement"("productId", "createdAt");

-- CreateIndex
CREATE INDEX "StockMovement_organizationId_createdAt_idx" ON "StockMovement"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "BrandAttachment_brandId_sortOrder_idx" ON "BrandAttachment"("brandId", "sortOrder");

-- CreateIndex
CREATE INDEX "ProviderFile_expiresAt_idx" ON "ProviderFile"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "ProviderFile_provider_sha256_key" ON "ProviderFile"("provider", "sha256");

-- CreateIndex
CREATE INDEX "Autopilot_organizationId_enabled_idx" ON "Autopilot"("organizationId", "enabled");

-- CreateIndex
CREATE INDEX "Autopilot_enabled_nextRunAt_idx" ON "Autopilot"("enabled", "nextRunAt");

-- CreateIndex
CREATE INDEX "AutopilotRun_organizationId_status_idx" ON "AutopilotRun"("organizationId", "status");

-- CreateIndex
CREATE INDEX "AutopilotRun_autopilotId_createdAt_idx" ON "AutopilotRun"("autopilotId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AutopilotRun_autopilotId_slotKey_key" ON "AutopilotRun"("autopilotId", "slotKey");

-- AddForeignKey
ALTER TABLE "ProductImage" ADD CONSTRAINT "ProductImage_productId_fkey" FOREIGN KEY ("productId") REFERENCES "CatalogueItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_productId_fkey" FOREIGN KEY ("productId") REFERENCES "CatalogueItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrandAttachment" ADD CONSTRAINT "BrandAttachment_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Autopilot" ADD CONSTRAINT "Autopilot_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Autopilot" ADD CONSTRAINT "Autopilot_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutopilotRun" ADD CONSTRAINT "AutopilotRun_autopilotId_fkey" FOREIGN KEY ("autopilotId") REFERENCES "Autopilot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutopilotRun" ADD CONSTRAINT "AutopilotRun_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Backfill: every existing team gets the Products module; Autopilot goes to teams that already
-- have what it needs (Social Publishing and AI Content). New teams get both when they are created.
INSERT INTO "OrganizationModule" ("id", "organizationId", "moduleKey", "enabled", "enabledAt")
SELECT 'bf_prod_' || o."id", o."id", 'PRODUCTS', true, CURRENT_TIMESTAMP
FROM "Organization" o
WHERE NOT EXISTS (SELECT 1 FROM "OrganizationModule" m WHERE m."organizationId" = o."id" AND m."moduleKey" = 'PRODUCTS');

INSERT INTO "OrganizationModule" ("id", "organizationId", "moduleKey", "enabled", "enabledAt")
SELECT 'bf_auto_' || o."id", o."id", 'AUTOPILOT', true, CURRENT_TIMESTAMP
FROM "Organization" o
WHERE EXISTS (SELECT 1 FROM "OrganizationModule" s WHERE s."organizationId" = o."id" AND s."moduleKey" = 'SOCIAL_PUBLISHING' AND s."enabled")
  AND EXISTS (SELECT 1 FROM "OrganizationModule" a WHERE a."organizationId" = o."id" AND a."moduleKey" = 'AI_CONTENT' AND a."enabled")
  AND NOT EXISTS (SELECT 1 FROM "OrganizationModule" m WHERE m."organizationId" = o."id" AND m."moduleKey" = 'AUTOPILOT');
