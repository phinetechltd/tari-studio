-- AlterTable
ALTER TABLE "GeneratedAsset" ADD COLUMN     "modelKey" TEXT,
ADD COLUMN     "providerMilliCredits" INTEGER,
ADD COLUMN     "providerUsdMicros" INTEGER;

-- AlterTable
ALTER TABLE "Notification" ALTER COLUMN "organizationId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "setupState" JSONB;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "dismissedHints" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "hintsEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "phone" TEXT;

-- CreateTable
CREATE TABLE "NotificationDelivery" (
    "id" TEXT NOT NULL,
    "notificationId" TEXT,
    "organizationId" TEXT,
    "userId" TEXT,
    "event" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "error" TEXT,
    "provider" TEXT,
    "providerRef" TEXT,
    "mock" BOOLEAN NOT NULL DEFAULT false,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationPreference" (
    "userId" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("userId","event","channel")
);

-- CreateTable
CREATE TABLE "AlertMark" (
    "key" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AlertMark_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "AiModel" (
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'HIGGSFIELD',
    "family" TEXT NOT NULL,
    "mediaType" TEXT NOT NULL,
    "endpoints" JSONB NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "defaultFor" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "creditsPerImage" INTEGER,
    "creditsPerStep" INTEGER,
    "providerMilliCreditsHint" INTEGER,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiModel_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "ProviderCreditLedger" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "milliCredits" INTEGER NOT NULL,
    "usdMicros" INTEGER,
    "expiresAt" TIMESTAMP(3),
    "consumedMilli" INTEGER NOT NULL DEFAULT 0,
    "expiredAt" TIMESTAMP(3),
    "organizationId" TEXT,
    "assetId" TEXT,
    "modelKey" TEXT,
    "note" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProviderCreditLedger_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "NotificationDelivery_status_createdAt_idx" ON "NotificationDelivery"("status", "createdAt");

-- CreateIndex
CREATE INDEX "NotificationDelivery_channel_createdAt_idx" ON "NotificationDelivery"("channel", "createdAt");

-- CreateIndex
CREATE INDEX "NotificationDelivery_organizationId_createdAt_idx" ON "NotificationDelivery"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "NotificationDelivery_event_createdAt_idx" ON "NotificationDelivery"("event", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ProviderCreditLedger_assetId_key" ON "ProviderCreditLedger"("assetId");

-- CreateIndex
CREATE INDEX "ProviderCreditLedger_provider_createdAt_idx" ON "ProviderCreditLedger"("provider", "createdAt");

-- CreateIndex
CREATE INDEX "ProviderCreditLedger_provider_kind_expiresAt_idx" ON "ProviderCreditLedger"("provider", "kind", "expiresAt");

-- CreateIndex
CREATE INDEX "ProviderCreditLedger_organizationId_createdAt_idx" ON "ProviderCreditLedger"("organizationId", "createdAt");

-- AddForeignKey
ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Data: the model catalogue. Soul 2 and Seedance 2.5 are what the Studio used
-- before the catalogue existed, so they start enabled at the price list's
-- rates (null credits). Kling 3.0 and Hailuo 2.3 start disabled: a platform
-- admin prices and enables them. Request formats from docs.higgsfield.ai
-- (3 Oct 2026).
INSERT INTO "AiModel" ("key", "label", "provider", "family", "mediaType", "endpoints", "enabled", "defaultFor", "description", "sortOrder", "updatedAt") VALUES
  ('soul-2', 'Soul 2', 'HIGGSFIELD', 'soul', 'IMAGE',
   '{"image": "higgsfield-ai/soul/v2/standard"}', true, ARRAY['image'],
   'Photoreal stills and posters at 1080p, in any social shape.', 10, CURRENT_TIMESTAMP),
  ('seedance-2.5', 'Seedance 2.5', 'HIGGSFIELD', 'seedance', 'VIDEO',
   '{"video": "bytedance/seedance-2.5/text-to-video", "animate": "bytedance/seedance-2.5/image-to-video", "extend": "bytedance/seedance-2.5/video-extend"}', true, ARRAY['video', 'animate', 'extend'],
   '4 to 30 seconds at 720p, with sound.', 20, CURRENT_TIMESTAMP),
  ('kling-3.0', 'Kling 3.0', 'HIGGSFIELD', 'kling', 'VIDEO',
   '{"video": "kling-video/v3.0/std/text-to-video", "animate": "kling-video/v3.0/std/image-to-video"}', false, ARRAY[]::TEXT[],
   'Cinematic motion, 3 to 15 seconds, with sound. Square, vertical or wide.', 30, CURRENT_TIMESTAMP),
  ('hailuo-2.3', 'Hailuo 2.3', 'HIGGSFIELD', 'hailuo', 'VIDEO',
   '{"video": "minimax/hailuo-2.3/standard/text-to-video", "animate": "minimax/hailuo-2.3/standard/image-to-video"}', false, ARRAY[]::TEXT[],
   '6 or 10 seconds at 768p, no sound. The model picks the shape.', 40, CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;
