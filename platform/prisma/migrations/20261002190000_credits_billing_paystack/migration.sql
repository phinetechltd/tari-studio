-- AlterTable
ALTER TABLE "GeneratedAsset" ADD COLUMN     "showcase" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "showcaseTitle" TEXT,
ADD COLUMN     "showcasedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "credits" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "PaymentIntent" ADD COLUMN     "automatic" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "billingCycle" TEXT,
ADD COLUMN     "channel" TEXT,
ADD COLUMN     "checkoutUrl" TEXT,
ADD COLUMN     "credits" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "email" TEXT,
ADD COLUMN     "planKey" TEXT,
ALTER COLUMN "phone" DROP NOT NULL;

-- AlterTable
ALTER TABLE "TokenLedger" ADD COLUMN     "grantKey" TEXT;

-- CreateTable
CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "plan" TEXT NOT NULL,
    "cycle" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "paymentMethod" TEXT NOT NULL,
    "autoRenew" BOOLEAN NOT NULL DEFAULT false,
    "currentPeriodStart" TIMESTAMP(3) NOT NULL,
    "currentPeriodEnd" TIMESTAMP(3) NOT NULL,
    "nextGrantAt" TIMESTAMP(3),
    "authCipherText" TEXT,
    "authIv" TEXT,
    "authTag" TEXT,
    "cardLabel" TEXT,
    "billingEmail" TEXT,
    "renewalAttempts" INTEGER NOT NULL DEFAULT 0,
    "nextRenewalAttemptAt" TIMESTAMP(3),
    "previousWorkspacePlan" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_organizationId_key" ON "Subscription"("organizationId");

-- CreateIndex
CREATE INDEX "Subscription_status_currentPeriodEnd_idx" ON "Subscription"("status", "currentPeriodEnd");

-- CreateIndex
CREATE INDEX "Subscription_nextGrantAt_idx" ON "Subscription"("nextGrantAt");

-- CreateIndex
CREATE INDEX "GeneratedAsset_showcase_showcasedAt_idx" ON "GeneratedAsset"("showcase", "showcasedAt");

-- CreateIndex
CREATE UNIQUE INDEX "TokenLedger_grantKey_key" ON "TokenLedger"("grantKey");

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Data: the image and video token wallets become one credit wallet, at the
-- tokens' shilling value rounded up in the customer's favour (src/lib/pricing.ts:
-- an image token, KES 100, is 8 credits; a video token, KES 1,000, is 73).
-- Each conversion leaves CONVERT rows in the ledger, so the history shows it.
INSERT INTO "TokenLedger" ("id", "organizationId", "kind", "delta", "reason", "note", "createdAt")
SELECT 'conv_' || replace(gen_random_uuid()::text, '-', ''), b."organizationId", b."kind", -b."balance", 'CONVERT',
       'Converted to credits when pricing moved to plans (2 Oct 2026)', CURRENT_TIMESTAMP
FROM "TokenBalance" b
WHERE b."kind" IN ('IMAGE', 'VIDEO') AND b."balance" <> 0;

INSERT INTO "TokenLedger" ("id", "organizationId", "kind", "delta", "reason", "note", "createdAt")
SELECT 'conv_' || replace(gen_random_uuid()::text, '-', ''), t."organizationId", 'CREDIT', t."credits", 'CONVERT',
       'Image and video tokens converted to credits (image 8, video 73)', CURRENT_TIMESTAMP
FROM (
  SELECT "organizationId",
         SUM(CASE "kind" WHEN 'IMAGE' THEN "balance" * 8 WHEN 'VIDEO' THEN "balance" * 73 ELSE 0 END) AS "credits"
  FROM "TokenBalance"
  WHERE "kind" IN ('IMAGE', 'VIDEO')
  GROUP BY "organizationId"
) t
WHERE t."credits" > 0;

INSERT INTO "TokenBalance" ("id", "organizationId", "kind", "balance", "updatedAt")
SELECT 'conv_' || replace(gen_random_uuid()::text, '-', ''), t."organizationId", 'CREDIT', t."credits", CURRENT_TIMESTAMP
FROM (
  SELECT "organizationId",
         SUM(CASE "kind" WHEN 'IMAGE' THEN "balance" * 8 WHEN 'VIDEO' THEN "balance" * 73 ELSE 0 END) AS "credits"
  FROM "TokenBalance"
  WHERE "kind" IN ('IMAGE', 'VIDEO')
  GROUP BY "organizationId"
) t
WHERE t."credits" > 0
ON CONFLICT ("organizationId", "kind") DO UPDATE SET "balance" = "TokenBalance"."balance" + EXCLUDED."balance", "updatedAt" = CURRENT_TIMESTAMP;

DELETE FROM "TokenBalance" WHERE "kind" IN ('IMAGE', 'VIDEO');
