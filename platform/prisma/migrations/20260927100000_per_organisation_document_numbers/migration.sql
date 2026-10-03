-- Brand, task and campaign numbers are issued per organisation (src/lib/numbering.ts),
-- so their uniqueness must be per organisation too: a global unique index made the
-- second organisation's BRD-0001 / CMP-0001 / TSK-0001 collide with the first's.

-- DropIndex
DROP INDEX "Brand_brandNumber_key";

-- DropIndex
DROP INDEX "Campaign_campaignNumber_key";

-- DropIndex
DROP INDEX "ContentTask_taskNumber_key";

-- CreateIndex
CREATE UNIQUE INDEX "Brand_organizationId_brandNumber_key" ON "Brand"("organizationId", "brandNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Campaign_organizationId_campaignNumber_key" ON "Campaign"("organizationId", "campaignNumber");

-- CreateIndex
CREATE UNIQUE INDEX "ContentTask_organizationId_taskNumber_key" ON "ContentTask"("organizationId", "taskNumber");

