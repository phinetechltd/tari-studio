-- AlterTable
ALTER TABLE "Subscription" ADD COLUMN     "creditsPerMonth" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "priceCents" INTEGER NOT NULL DEFAULT 0;

-- Data: subscriptions bought before the price list became editable keep what
-- they were sold at, the defaults of 2 Oct 2026 (src/lib/pricing.ts).
UPDATE "Subscription" SET
  "creditsPerMonth" = CASE "plan" WHEN 'BASIC' THEN 120 WHEN 'PRO' THEN 600 WHEN 'MAX' THEN 1800 ELSE 0 END,
  "priceCents" = CASE
    WHEN "plan" = 'BASIC' AND "cycle" = 'MONTHLY' THEN 155000
    WHEN "plan" = 'BASIC' AND "cycle" = 'ANNUAL' THEN 1860000
    WHEN "plan" = 'PRO' AND "cycle" = 'MONTHLY' THEN 495000
    WHEN "plan" = 'PRO' AND "cycle" = 'ANNUAL' THEN 4680000
    WHEN "plan" = 'MAX' AND "cycle" = 'MONTHLY' THEN 1340000
    WHEN "plan" = 'MAX' AND "cycle" = 'ANNUAL' THEN 12000000
    ELSE 0
  END
WHERE "priceCents" = 0;
