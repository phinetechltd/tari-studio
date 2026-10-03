-- AlterTable
ALTER TABLE "GeneratedAsset" ADD COLUMN     "archivedAt" TIMESTAMP(3),
ADD COLUMN     "aspectRatio" TEXT,
ADD COLUMN     "durationSeconds" INTEGER,
ADD COLUMN     "error" TEXT,
ADD COLUMN     "orderId" TEXT,
ADD COLUMN     "parentAssetId" TEXT,
ADD COLUMN     "resolution" TEXT,
ADD COLUMN     "storageKey" TEXT,
ADD COLUMN     "threadId" TEXT,
ADD COLUMN     "tokensCharged" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateTable
CREATE TABLE "TokenBalance" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "balance" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TokenBalance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TokenLedger" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "delta" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "paymentIntentId" TEXT,
    "assetId" TEXT,
    "createdById" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TokenLedger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "publicToken" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING_PAYMENT',
    "customerName" TEXT NOT NULL,
    "customerPhone" TEXT NOT NULL,
    "customerEmail" TEXT,
    "businessName" TEXT,
    "brief" TEXT NOT NULL,
    "imageTokens" INTEGER NOT NULL DEFAULT 0,
    "videoSeconds" INTEGER NOT NULL DEFAULT 0,
    "videoTokens" INTEGER NOT NULL DEFAULT 0,
    "aspectRatio" TEXT,
    "extras" JSONB NOT NULL DEFAULT '[]',
    "referenceLink" TEXT,
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'KES',
    "paidAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentIntent" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "orderId" TEXT,
    "imageTokens" INTEGER NOT NULL DEFAULT 0,
    "videoTokens" INTEGER NOT NULL DEFAULT 0,
    "provider" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'KES',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "providerRef" TEXT,
    "merchantRequestId" TEXT,
    "receiptRef" TEXT,
    "failureReason" TEXT,
    "providerPayload" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "PaymentIntent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudioThread" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudioThread_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudioMessage" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'TEXT',
    "body" TEXT NOT NULL,
    "assetId" TEXT,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StudioMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TokenBalance_organizationId_kind_key" ON "TokenBalance"("organizationId", "kind");

-- CreateIndex
CREATE INDEX "TokenLedger_organizationId_createdAt_idx" ON "TokenLedger"("organizationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "TokenLedger_paymentIntentId_kind_reason_key" ON "TokenLedger"("paymentIntentId", "kind", "reason");

-- CreateIndex
CREATE UNIQUE INDEX "TokenLedger_assetId_reason_key" ON "TokenLedger"("assetId", "reason");

-- CreateIndex
CREATE UNIQUE INDEX "Order_publicToken_key" ON "Order"("publicToken");

-- CreateIndex
CREATE INDEX "Order_organizationId_status_createdAt_idx" ON "Order"("organizationId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "Order_customerPhone_idx" ON "Order"("customerPhone");

-- CreateIndex
CREATE UNIQUE INDEX "Order_organizationId_number_key" ON "Order"("organizationId", "number");

-- CreateIndex
CREATE INDEX "PaymentIntent_organizationId_createdAt_idx" ON "PaymentIntent"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "PaymentIntent_orderId_idx" ON "PaymentIntent"("orderId");

-- CreateIndex
CREATE INDEX "PaymentIntent_status_createdAt_idx" ON "PaymentIntent"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentIntent_provider_providerRef_key" ON "PaymentIntent"("provider", "providerRef");

-- CreateIndex
CREATE INDEX "StudioThread_organizationId_archivedAt_updatedAt_idx" ON "StudioThread"("organizationId", "archivedAt", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "StudioMessage_assetId_key" ON "StudioMessage"("assetId");

-- CreateIndex
CREATE INDEX "StudioMessage_threadId_createdAt_idx" ON "StudioMessage"("threadId", "createdAt");

-- CreateIndex
CREATE INDEX "StudioMessage_organizationId_idx" ON "StudioMessage"("organizationId");

-- CreateIndex
CREATE INDEX "GeneratedAsset_orderId_idx" ON "GeneratedAsset"("orderId");

-- CreateIndex
CREATE INDEX "GeneratedAsset_threadId_idx" ON "GeneratedAsset"("threadId");

-- AddForeignKey
ALTER TABLE "GeneratedAsset" ADD CONSTRAINT "GeneratedAsset_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GeneratedAsset" ADD CONSTRAINT "GeneratedAsset_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "StudioThread"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GeneratedAsset" ADD CONSTRAINT "GeneratedAsset_parentAssetId_fkey" FOREIGN KEY ("parentAssetId") REFERENCES "GeneratedAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TokenBalance" ADD CONSTRAINT "TokenBalance_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TokenLedger" ADD CONSTRAINT "TokenLedger_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TokenLedger" ADD CONSTRAINT "TokenLedger_paymentIntentId_fkey" FOREIGN KEY ("paymentIntentId") REFERENCES "PaymentIntent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentIntent" ADD CONSTRAINT "PaymentIntent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentIntent" ADD CONSTRAINT "PaymentIntent_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudioThread" ADD CONSTRAINT "StudioThread_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudioThread" ADD CONSTRAINT "StudioThread_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudioMessage" ADD CONSTRAINT "StudioMessage_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "StudioThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudioMessage" ADD CONSTRAINT "StudioMessage_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

