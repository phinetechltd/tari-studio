import { NextResponse } from "next/server";
import { prismaProjects } from "@/lib/projects-db";

// GET /api/projects/[projectId] - Get project details with issues
export async function GET(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;
    const project = await prismaProjects.getProjectWithSummary(projectId);

    if (!project) {
      return NextResponse.json(
        { success: false, error: "Project not found" },
        { status: 404 }
      );
    }

    // Get query params for filtering issues
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "20");
    const status = searchParams.get("status")?.split(",") || undefined;
    const priority = searchParams.get("priority")?.split(",") || undefined;
    const type = searchParams.get("type")?.split(",") || undefined;
    const severity = searchParams.get("severity")?.split(",") || undefined;
    const search = searchParams.get("search") || undefined;

    const issues = await prismaProjects.getProjectIssues({
      projectId: projectId,
      status,
      priority,
      type,
      severity,
      search,
      page,
      limit,
    });

    const totalCount = await prismaProjects.issue.count({
      where: { projectId: projectId },
    });

    return NextResponse.json({
      success: true,
      data: {
        project,
        issues: {
          items: issues,
          pagination: {
            page,
            limit,
            total: totalCount,
            totalPages: Math.ceil(totalCount / limit),
          },
        },
      },
    });
  } catch (error) {
    console.error("Failed to fetch project:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch project" },
      { status: 500 }
    );
  }
}

// POST /api/projects/[projectId]/issues - Create a new issue
export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;
    const body = await request.json();

    const issue = await prismaProjects.createIssueWithHistory({
      projectId,
      title: body.title,
      description: body.description,
      type: body.type,
      priority: body.priority,
      severity: body.severity,
      reporterId: body.reporterId,
      assigneeId: body.assigneeId,
      environment: body.environment,
      stepsToReproduce: body.stepsToReproduce,
      expectedBehavior: body.expectedBehavior,
      actualBehavior: body.actualBehavior,
      tags: body.tags,
    });

    return NextResponse.json(
      { success: true, data: issue },
      { status: 201 }
    );
  } catch (error) {
    console.error("Failed to create issue:", error);
    return NextResponse.json(
      { success: false, error: "Failed to create issue" },
      { status: 500 }
    );
  }
}

// PATCH /api/projects/[projectId] - Update project
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;
    const body = await request.json();

    const project = await prismaProjects.upsertProject({
      id: projectId,
      ...body,
    });

    return NextResponse.json({
      success: true,
      data: project,
    });
  } catch (error) {
    console.error("Failed to update project:", error);
    return NextResponse.json(
      { success: false, error: "Failed to update project" },
      { status: 500 }
    );
  }
}
