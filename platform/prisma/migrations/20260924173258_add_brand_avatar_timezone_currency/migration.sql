/*
  Warnings:

  - The `filters` column on the `DashboardWidget` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `details` column on the `HealthCheck` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - Changed the type of `config` on the `ProjectIntegration` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- AlterTable
ALTER TABLE "Brand" ADD COLUMN     "avatarUrl" TEXT,
ADD COLUMN     "defaultCurrency" TEXT NOT NULL DEFAULT 'KES',
ADD COLUMN     "timezone" TEXT NOT NULL DEFAULT 'Africa/Nairobi';

-- AlterTable
ALTER TABLE "DashboardWidget" ALTER COLUMN "id" DROP DEFAULT,
DROP COLUMN "filters",
ADD COLUMN     "filters" JSONB NOT NULL DEFAULT '{}';

-- AlterTable
ALTER TABLE "HealthCheck" ALTER COLUMN "id" DROP DEFAULT,
DROP COLUMN "details",
ADD COLUMN     "details" JSONB;

-- AlterTable
ALTER TABLE "Issue" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "IssueComment" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "IssueHistory" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Project" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "ProjectIntegration" ALTER COLUMN "id" DROP DEFAULT,
DROP COLUMN "config",
ADD COLUMN     "config" JSONB NOT NULL;

-- AlterTable
ALTER TABLE "UserDashboard" ALTER COLUMN "id" DROP DEFAULT;

-- AddForeignKey
ALTER TABLE "ProjectIntegration" ADD CONSTRAINT "ProjectIntegration_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
