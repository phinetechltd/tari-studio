-- Create project tracker tables
CREATE TABLE "Project" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "type" TEXT NOT NULL DEFAULT 'other',
    "ownerId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "baseUrl" TEXT,
    "healthEndpoint" TEXT,
    "healthCheckCron" TEXT,
    "lastHealthCheck" TIMESTAMP(3),
    "lastHealthStatus" TEXT NOT NULL DEFAULT 'unknown',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT now(),
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Project_slug_key" ON "Project"("slug");
CREATE INDEX "Project_ownerId_idx" ON "Project"("ownerId");
CREATE INDEX "Project_status_idx" ON "Project"("status");
CREATE INDEX "Project_type_idx" ON "Project"("type");

CREATE TABLE "ProjectIntegration" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "projectId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "config" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastSyncedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT now(),
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ProjectIntegration_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ProjectIntegration_projectId_idx" ON "ProjectIntegration"("projectId");
CREATE INDEX "ProjectIntegration_type_idx" ON "ProjectIntegration"("type");

CREATE TABLE "Issue" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "issueNumber" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "type" TEXT NOT NULL DEFAULT 'bug',
    "priority" TEXT NOT NULL DEFAULT 'medium',
    "status" TEXT NOT NULL DEFAULT 'open',
    "severity" TEXT NOT NULL DEFAULT 'major',
    "reporterId" TEXT,
    "assigneeId" TEXT,
    "resolvedById" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "rootCause" TEXT,
    "resolution" TEXT,
    "environment" TEXT NOT NULL DEFAULT 'unknown',
    "stepsToReproduce" TEXT,
    "expectedBehavior" TEXT,
    "actualBehavior" TEXT,
    "attachments" TEXT[] NOT NULL DEFAULT '{}',
    "tags" TEXT[] NOT NULL DEFAULT '{}',
    "relatedIssueIds" TEXT[] NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT now(),
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Issue_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Issue_issueNumber_key" ON "Issue"("issueNumber");
CREATE INDEX "Issue_projectId_idx" ON "Issue"("projectId");
CREATE INDEX "Issue_status_idx" ON "Issue"("status");
CREATE INDEX "Issue_priority_idx" ON "Issue"("priority");
CREATE INDEX "Issue_assigneeId_idx" ON "Issue"("assigneeId");
CREATE INDEX "Issue_createdAt_idx" ON "Issue"("createdAt");
CREATE INDEX "Issue_projectId_status_priority_idx" ON "Issue"("projectId", "status", "priority");

ALTER TABLE "Issue" ADD CONSTRAINT "Issue_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "IssueComment" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "issueId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "attachments" TEXT[] NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT now(),
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "IssueComment_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "IssueComment_issueId_idx" ON "IssueComment"("issueId");
CREATE INDEX "IssueComment_authorId_idx" ON "IssueComment"("authorId");
CREATE INDEX "IssueComment_issueId_createdAt_idx" ON "IssueComment"("issueId", "createdAt");

ALTER TABLE "IssueComment" ADD CONSTRAINT "IssueComment_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "Issue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "IssueHistory" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "issueId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "from" TEXT,
    "to" TEXT,
    "note" TEXT,
    "authorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT now(),
    CONSTRAINT "IssueHistory_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "IssueHistory_issueId_idx" ON "IssueHistory"("issueId");
CREATE INDEX "IssueHistory_issueId_createdAt_idx" ON "IssueHistory"("issueId", "createdAt");

ALTER TABLE "IssueHistory" ADD CONSTRAINT "IssueHistory_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "Issue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "HealthCheck" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "projectId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "httpStatus" INTEGER,
    "responseTimeMs" INTEGER,
    "errorMessage" TEXT,
    "details" TEXT,
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT now(),
    CONSTRAINT "HealthCheck_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "HealthCheck_projectId_idx" ON "HealthCheck"("projectId");
CREATE INDEX "HealthCheck_status_idx" ON "HealthCheck"("status");
CREATE INDEX "HealthCheck_checkedAt_idx" ON "HealthCheck"("checkedAt");

ALTER TABLE "HealthCheck" ADD CONSTRAINT "HealthCheck_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "DashboardWidget" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "widgetType" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "filters" TEXT NOT NULL DEFAULT '{}',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "visible" BOOLEAN NOT NULL DEFAULT true,
    "size" TEXT NOT NULL DEFAULT 'medium',
    "userDashboardId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT now(),
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DashboardWidget_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "DashboardWidget_widgetType_idx" ON "DashboardWidget"("widgetType");

CREATE TABLE "UserDashboard" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "userId" TEXT NOT NULL,
    "dashboardName" TEXT NOT NULL DEFAULT 'Default',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT now(),
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "UserDashboard_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "UserDashboard_userId_key" UNIQUE ("userId")
);
CREATE INDEX "UserDashboard_userId_idx" ON "UserDashboard"("userId");

ALTER TABLE "DashboardWidget" ADD CONSTRAINT "DashboardWidget_userDashboardId_fkey" FOREIGN KEY ("userDashboardId") REFERENCES "UserDashboard"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserDashboard" ADD CONSTRAINT "UserDashboard_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
