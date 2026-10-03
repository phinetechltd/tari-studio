/**
 * Project & Issue Management Database Client
 * 
 * Handles CRUD operations for projects, issues, health checks,
 * and dashboard configurations.
 */

import { PrismaClient } from "@prisma/client";

// Extended Prisma client with custom methods for project management
export class ProjectsPrismaClient extends PrismaClient {
  constructor() {
    super({
      log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
    });
  }

  /**
   * Create or update a project
   */
  async upsertProject(data: {
    id?: string;
    name: string;
    slug: string;
    description?: string;
    type?: string;
    ownerId?: string;
    baseUrl?: string;
    healthEndpoint?: string;
    healthCheckCron?: string;
  }) {
    const { id, ...rest } = data;
    if (id) {
      return this.project.update({ where: { id }, data: rest });
    }
    return this.project.create({ data: rest });
  }

  /**
   * Get project with issues summary
   */
  async getProjectWithSummary(projectId: string) {
    return this.project.findUnique({
      where: { id: projectId },
      include: {
        issues: {
          select: {
            _count: true,
            openCount: {
              select: { _count: true },
              where: { status: { in: ["open", "in_progress", "in_review"] } },
            },
            criticalCount: {
              select: { _count: true },
              where: { priority: { in: ["critical", "urgent"] }, status: { not: "closed" } },
            },
            resolvedCount: {
              select: { _count: true },
              where: { status: { in: ["resolved", "closed"] } },
            },
          },
        },
        healthChecks: {
          orderBy: { checkedAt: "desc" },
          take: 1,
          select: { status: true, checkedAt: true },
        },
      },
    });
  }

  /**
   * Get all projects with issue counts
   */
  async getAllProjectsSummary() {
    return this.project.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        slug: true,
        type: true,
        status: true,
        baseUrl: true,
        lastHealthStatus: true,
        lastHealthCheck: true,
        _count: {
          select: {
            issues: {
              where: { status: { not: "closed" } },
            },
          },
        },
        issues: {
          orderBy: { createdAt: "desc" },
          take: 5,
          select: {
            id: true,
            issueNumber: true,
            title: true,
            type: true,
            priority: true,
            status: true,
            severity: true,
            createdAt: true,
          },
        },
      },
    });
  }

  /**
   * Get issues for a project with filters
   */
  async getProjectIssues(params: {
    projectId: string;
    status?: string[];
    priority?: string[];
    type?: string[];
    severity?: string[];
    assigneeId?: string;
    search?: string;
    page?: number;
    limit?: number;
    sortBy?: string;
    sortOrder?: "asc" | "desc";
  }) {
    const { page = 1, limit = 20, sortBy = "createdAt", sortOrder = "desc", ...filters } = params;
    const where: Record<string, unknown> = { projectId: filters.projectId };
    delete (filters as Record<string, unknown>).projectId;

    // Apply filters
    if (filters.status?.length) {
      where.status = { in: filters.status };
    }
    if (filters.priority?.length) {
      where.priority = { in: filters.priority };
    }
    if (filters.type?.length) {
      where.type = { in: filters.type };
    }
    if (filters.severity?.length) {
      where.severity = { in: filters.severity };
    }
    if (filters.assigneeId) {
      where.assigneeId = filters.assigneeId;
    }
    if (filters.search) {
      where.OR = [
        { title: { contains: filters.search } },
        { description: { contains: filters.search } },
        { tags: { has: filters.search } },
      ];
    }

    return this.issue.findMany({
      where,
      orderBy: { [sortBy]: sortOrder },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        reporter: { select: { id: true, name: true, email: true } },
        assignee: { select: { id: true, name: true, email: true } },
        project: { select: { id: true, name: true, slug: true } },
        _count: {
          select: {
            comments: true,
            history: true,
          },
        },
      },
    });
  }

  /**
   * Create an issue with history tracking
   */
  async createIssueWithHistory(data: {
    projectId: string;
    title: string;
    description?: string;
    type?: string;
    priority?: string;
    severity?: string;
    reporterId?: string;
    assigneeId?: string;
    environment?: string;
    stepsToReproduce?: string;
    expectedBehavior?: string;
    actualBehavior?: string;
    tags?: string[];
  }) {
    // Generate issue number
    const project = await this.project.findUnique({
      where: { id: data.projectId },
      select: { id: true },
    });
    if (!project) throw new Error("Project not found");

    const lastIssue = await this.issue.findFirst({
      where: { projectId: data.projectId },
      orderBy: { createdAt: "desc" },
      select: { issueNumber: true },
    });

    const prefix = data.type === "feature" ? "FEAT" : data.type === "improvement" ? "IMP" : "BUG";
    const nextNum = lastIssue ? parseInt(lastIssue.issueNumber.split("-")[1]) + 1 : 1;
    const issueNumber = `${prefix}-${String(nextNum).padStart(4, "0")}`;

    // Create issue in transaction
    return this.$transaction(async (tx) => {
      const issue = await tx.issue.create({
        data: {
          projectId: data.projectId,
          title: data.title,
          description: data.description,
          type: data.type || "bug",
          priority: data.priority || "medium",
          severity: data.severity || "major",
          reporterId: data.reporterId,
          assigneeId: data.assigneeId,
          environment: data.environment || "unknown",
          stepsToReproduce: data.stepsToReproduce,
          expectedBehavior: data.expectedBehavior,
          actualBehavior: data.actualBehavior,
          tags: data.tags || [],
          issueNumber,
        },
        include: {
          project: { select: { id: true, name: true, slug: true } },
        },
      });

      // Create history entry
      await tx.issueHistory.create({
        data: {
          issueId: issue.id,
          action: "created",
          from: null,
          to: issue.status,
          note: `Issue created: ${issue.title}`,
          authorId: data.reporterId,
        },
      });

      return issue;
    });
  }

  /**
   * Update issue status with history tracking
   */
  async updateIssueStatus(issueId: string, newStatus: string, userId?: string, note?: string) {
    const issue = await this.issue.findUnique({ where: { id: issueId } });
    if (!issue) throw new Error("Issue not found");

    return this.$transaction(async (tx) => {
      const updated = await tx.issue.update({
        where: { id: issueId },
        data: {
          status: newStatus,
          resolvedAt: ["resolved", "closed", "wont_fix"].includes(newStatus) ? new Date() : undefined,
          resolvedById: ["resolved", "closed", "wont_fix"].includes(newStatus) ? userId : undefined,
        },
      });

      await tx.issueHistory.create({
        data: {
          issueId,
          action: "status_changed",
          from: issue.status,
          to: newStatus,
          note: note || `Status changed from ${issue.status} to ${newStatus}`,
          authorId: userId,
        },
      });

      return updated;
    });
  }

  /**
   * Get dashboard statistics
   */
  async getDashboardStats() {
    const [totalProjects, activeProjects, totalIssues, openIssues, criticalIssues, resolvedThisMonth] =
      await Promise.all([
        this.project.count(),
        this.project.count({ where: { status: "active" } }),
        this.issue.count(),
        this.issue.count({ where: { status: { in: ["open", "in_progress", "in_review"] } } }),
        this.issue.count({
          where: {
            priority: { in: ["critical", "urgent"] },
            status: { not: "closed" },
          },
        }),
        this.issue.count({
          where: {
            status: { in: ["resolved", "closed"] },
            resolvedAt: { gte: new Date(new Date().setDate(1)) },
          },
        }),
      ]);

    return {
      totalProjects,
      activeProjects,
      totalIssues,
      openIssues,
      criticalIssues,
      resolvedThisMonth,
    };
  }

  /**
   * Record a health check result
   */
  async recordHealthCheck(projectId: string, result: {
    status: string;
    httpStatus?: number;
    responseTimeMs?: number;
    errorMessage?: string;
    details?: Record<string, unknown>;
  }) {
    return this.healthCheck.create({
      data: {
        projectId,
        status: result.status,
        httpStatus: result.httpStatus,
        responseTimeMs: result.responseTimeMs,
        errorMessage: result.errorMessage,
        details: result.details,
      },
    }).then(async () => {
      // Update project's last health status
      await this.project.update({
        where: { id: projectId },
        data: {
          lastHealthStatus: result.status,
          lastHealthCheck: new Date(),
        },
      });
    });
  }
}

// Singleton instance
declare global {
  // eslint-disable-next-line no-var
  var projectsPrisma: ProjectsPrismaClient | undefined;
}

export const prismaProjects = globalThis.projectsPrisma ?? new ProjectsPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalThis.projectsPrisma = prismaProjects;
}
