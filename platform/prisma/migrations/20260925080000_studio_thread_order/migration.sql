-- AlterTable
ALTER TABLE "StudioThread" ADD COLUMN     "orderId" TEXT;

-- CreateIndex
CREATE INDEX "StudioThread_orderId_idx" ON "StudioThread"("orderId");

-- AddForeignKey
ALTER TABLE "StudioThread" ADD CONSTRAINT "StudioThread_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

