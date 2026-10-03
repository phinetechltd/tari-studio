-- CreateTable
CREATE TABLE "Brand" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "brandNumber" TEXT NOT NULL,
    "guidelines" JSONB,
    "contactName" TEXT,
    "contactEmail" TEXT,
    "contactPhone" TEXT,
    "website" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "archivedAt" TIMESTAMP(3),
    "aiOverrides" JSONB,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Brand_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CatalogueItem" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sku" TEXT,
    "description" TEXT,
    "priceCents" INTEGER,
    "imageUrl" TEXT,
    "category" TEXT,
    "tags" JSONB NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "archivedAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CatalogueItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentTask" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "taskNumber" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "contentType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "priority" TEXT NOT NULL DEFAULT 'MEDIUM',
    "dueAt" TIMESTAMP(3),
    "targetPlatform" TEXT,
    "aiBrief" JSONB,
    "aiMetadata" JSONB,
    "createdById" TEXT NOT NULL,
    "assigneeId" TEXT,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContentTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentSubmission" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "stage" TEXT NOT NULL DEFAULT 'Draft',
    "title" TEXT,
    "content" TEXT,
    "fileUrl" TEXT,
    "fileType" TEXT,
    "fileSize" INTEGER,
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContentSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Comment" (
    "id" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "taskId" TEXT,
    "submissionId" TEXT,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Comment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SocialChannel" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "externalId" TEXT,
    "name" TEXT NOT NULL,
    "handle" TEXT,
    "tokenCipher" TEXT,
    "tokenIv" TEXT,
    "tokenTag" TEXT,
    "tokenExpiresAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "archivedAt" TIMESTAMP(3),
    "metadata" JSONB,
    "connectedById" TEXT,
    "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SocialChannel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SocialPost" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "campaignId" TEXT,
    "content" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "scheduledAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "externalId" TEXT,
    "externalUrl" TEXT,
    "metrics" JSONB,
    "metricsUpdatedAt" TIMESTAMP(3),
    "error" TEXT,
    "createdById" TEXT NOT NULL,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "aiMetadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SocialPost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Campaign" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "campaignNumber" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "source" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "budgetCents" INTEGER,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "utmParams" JSONB,
    "landingUrl" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrackedLink" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "shortCode" TEXT NOT NULL,
    "destinationUrl" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "linkType" TEXT NOT NULL DEFAULT 'whatsapp',
    "clickCount" INTEGER NOT NULL DEFAULT 0,
    "lastClickedAt" TIMESTAMP(3),
    "qrCodeUrl" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrackedLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClickEvent" (
    "id" TEXT NOT NULL,
    "linkId" TEXT NOT NULL,
    "clickedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "referer" TEXT,
    "country" TEXT,
    "deviceType" TEXT,

    CONSTRAINT "ClickEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookEvent" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "externalId" TEXT,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "processedAt" TIMESTAMP(3),
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Brand_brandNumber_key" ON "Brand"("brandNumber");

-- CreateIndex
CREATE INDEX "Brand_organizationId_idx" ON "Brand"("organizationId");

-- CreateIndex
CREATE INDEX "Brand_organizationId_status_idx" ON "Brand"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Brand_organizationId_slug_key" ON "Brand"("organizationId", "slug");

-- CreateIndex
CREATE INDEX "CatalogueItem_brandId_idx" ON "CatalogueItem"("brandId");

-- CreateIndex
CREATE INDEX "CatalogueItem_organizationId_idx" ON "CatalogueItem"("organizationId");

-- CreateIndex
CREATE INDEX "CatalogueItem_brandId_status_idx" ON "CatalogueItem"("brandId", "status");

-- CreateIndex
CREATE INDEX "CatalogueItem_brandId_category_idx" ON "CatalogueItem"("brandId", "category");

-- CreateIndex
CREATE UNIQUE INDEX "ContentTask_taskNumber_key" ON "ContentTask"("taskNumber");

-- CreateIndex
CREATE INDEX "ContentTask_organizationId_idx" ON "ContentTask"("organizationId");

-- CreateIndex
CREATE INDEX "ContentTask_brandId_idx" ON "ContentTask"("brandId");

-- CreateIndex
CREATE INDEX "ContentTask_status_idx" ON "ContentTask"("status");

-- CreateIndex
CREATE INDEX "ContentTask_assigneeId_idx" ON "ContentTask"("assigneeId");

-- CreateIndex
CREATE INDEX "ContentTask_createdById_idx" ON "ContentTask"("createdById");

-- CreateIndex
CREATE INDEX "ContentTask_organizationId_status_priority_idx" ON "ContentTask"("organizationId", "status", "priority");

-- CreateIndex
CREATE INDEX "ContentSubmission_taskId_idx" ON "ContentSubmission"("taskId");

-- CreateIndex
CREATE INDEX "ContentSubmission_taskId_stage_idx" ON "ContentSubmission"("taskId", "stage");

-- CreateIndex
CREATE INDEX "Comment_taskId_idx" ON "Comment"("taskId");

-- CreateIndex
CREATE INDEX "Comment_submissionId_idx" ON "Comment"("submissionId");

-- CreateIndex
CREATE INDEX "Comment_authorId_idx" ON "Comment"("authorId");

-- CreateIndex
CREATE INDEX "SocialChannel_organizationId_idx" ON "SocialChannel"("organizationId");

-- CreateIndex
CREATE INDEX "SocialChannel_brandId_idx" ON "SocialChannel"("brandId");

-- CreateIndex
CREATE INDEX "SocialChannel_brandId_platform_idx" ON "SocialChannel"("brandId", "platform");

-- CreateIndex
CREATE INDEX "SocialChannel_status_idx" ON "SocialChannel"("status");

-- CreateIndex
CREATE INDEX "SocialPost_organizationId_idx" ON "SocialPost"("organizationId");

-- CreateIndex
CREATE INDEX "SocialPost_brandId_idx" ON "SocialPost"("brandId");

-- CreateIndex
CREATE INDEX "SocialPost_channelId_idx" ON "SocialPost"("channelId");

-- CreateIndex
CREATE INDEX "SocialPost_campaignId_idx" ON "SocialPost"("campaignId");

-- CreateIndex
CREATE INDEX "SocialPost_status_idx" ON "SocialPost"("status");

-- CreateIndex
CREATE INDEX "SocialPost_scheduledAt_idx" ON "SocialPost"("scheduledAt");

-- CreateIndex
CREATE INDEX "SocialPost_organizationId_status_scheduledAt_idx" ON "SocialPost"("organizationId", "status", "scheduledAt");

-- CreateIndex
CREATE UNIQUE INDEX "Campaign_campaignNumber_key" ON "Campaign"("campaignNumber");

-- CreateIndex
CREATE INDEX "Campaign_organizationId_idx" ON "Campaign"("organizationId");

-- CreateIndex
CREATE INDEX "Campaign_brandId_idx" ON "Campaign"("brandId");

-- CreateIndex
CREATE INDEX "Campaign_status_idx" ON "Campaign"("status");

-- CreateIndex
CREATE INDEX "Campaign_brandId_status_idx" ON "Campaign"("brandId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "TrackedLink_shortCode_key" ON "TrackedLink"("shortCode");

-- CreateIndex
CREATE INDEX "TrackedLink_campaignId_idx" ON "TrackedLink"("campaignId");

-- CreateIndex
CREATE INDEX "TrackedLink_organizationId_idx" ON "TrackedLink"("organizationId");

-- CreateIndex
CREATE INDEX "TrackedLink_shortCode_idx" ON "TrackedLink"("shortCode");

-- CreateIndex
CREATE INDEX "TrackedLink_linkType_idx" ON "TrackedLink"("linkType");

-- CreateIndex
CREATE INDEX "ClickEvent_linkId_idx" ON "ClickEvent"("linkId");

-- CreateIndex
CREATE INDEX "ClickEvent_linkId_clickedAt_idx" ON "ClickEvent"("linkId", "clickedAt");

-- CreateIndex
CREATE INDEX "ClickEvent_clickedAt_idx" ON "ClickEvent"("clickedAt");

-- CreateIndex
CREATE INDEX "WebhookEvent_organizationId_status_idx" ON "WebhookEvent"("organizationId", "status");

-- CreateIndex
CREATE INDEX "WebhookEvent_source_eventType_idx" ON "WebhookEvent"("source", "eventType");

-- CreateIndex
CREATE INDEX "WebhookEvent_createdAt_idx" ON "WebhookEvent"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "WebhookEvent_organizationId_externalId_key" ON "WebhookEvent"("organizationId", "externalId");

-- CreateIndex
CREATE INDEX "AiUsage_brandId_idx" ON "AiUsage"("brandId");

-- AddForeignKey
ALTER TABLE "AiUsage" ADD CONSTRAINT "AiUsage_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Brand" ADD CONSTRAINT "Brand_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Brand" ADD CONSTRAINT "Brand_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogueItem" ADD CONSTRAINT "CatalogueItem_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogueItem" ADD CONSTRAINT "CatalogueItem_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentTask" ADD CONSTRAINT "ContentTask_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentTask" ADD CONSTRAINT "ContentTask_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentTask" ADD CONSTRAINT "ContentTask_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentTask" ADD CONSTRAINT "ContentTask_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentSubmission" ADD CONSTRAINT "ContentSubmission_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "ContentTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "ContentTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "ContentSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocialChannel" ADD CONSTRAINT "SocialChannel_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocialChannel" ADD CONSTRAINT "SocialChannel_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocialPost" ADD CONSTRAINT "SocialPost_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocialPost" ADD CONSTRAINT "SocialPost_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocialPost" ADD CONSTRAINT "SocialPost_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "SocialChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocialPost" ADD CONSTRAINT "SocialPost_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocialPost" ADD CONSTRAINT "SocialPost_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocialPost" ADD CONSTRAINT "SocialPost_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrackedLink" ADD CONSTRAINT "TrackedLink_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrackedLink" ADD CONSTRAINT "TrackedLink_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrackedLink" ADD CONSTRAINT "TrackedLink_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClickEvent" ADD CONSTRAINT "ClickEvent_linkId_fkey" FOREIGN KEY ("linkId") REFERENCES "TrackedLink"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebhookEvent" ADD CONSTRAINT "WebhookEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
