import { NextResponse } from "next/server";
import { prismaProjects } from "@/lib/projects-db";

// GET /api/projects/[projectId]/issues/[issueId] - Get issue details
export async function GET(
  request: Request,
  { params }: { params: Promise<{ projectId: string; issueId: string }> }
) {
  try {
    const { projectId, issueId } = await params;
    
    const issue = await prismaProjects.issue.findUnique({
      where: { id: issueId, projectId },
      include: {
        reporter: { select: { id: true, name: true, email: true } },
        assignee: { select: { id: true, name: true, email: true } },
        resolvedBy: { select: { id: true, name: true, email: true } },
        project: { select: { id: true, name: true, slug: true } },
        comments: {
          orderBy: { createdAt: "asc" },
          include: {
            author: { select: { id: true, name: true, email: true } },
          },
        },
        history: {
          orderBy: { createdAt: "desc" },
          take: 50,
          include: {
            author: { select: { id: true, name: true, email: true } },
          },
        },
      },
    });

    if (!issue) {
      return NextResponse.json(
        { success: false, error: "Issue not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: issue,
    });
  } catch (error) {
    console.error("Failed to fetch issue:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch issue" },
      { status: 500 }
    );
  }
}

// PATCH /api/projects/[projectId]/issues/[issueId] - Update issue
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ projectId: string; issueId: string }> }
) {
  try {
    const { issueId } = await params;
    const body = await request.json();

    // Check if issue exists
    const existing = await prismaProjects.issue.findUnique({
      where: { id: issueId },
    });

    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Issue not found" },
        { status: 404 }
      );
    }

    const updateData: Record<string, unknown> = {};

    if (body.title !== undefined) updateData.title = body.title;
    if (body.description !== undefined) updateData.description = body.description;
    if (body.priority !== undefined) updateData.priority = body.priority;
    if (body.severity !== undefined) updateData.severity = body.severity;
    if (body.assigneeId !== undefined) updateData.assigneeId = body.assigneeId;
    if (body.environment !== undefined) updateData.environment = body.environment;
    if (body.stepsToReproduce !== undefined) updateData.stepsToReproduce = body.stepsToReproduce;
    if (body.expectedBehavior !== undefined) updateData.expectedBehavior = body.expectedBehavior;
    if (body.actualBehavior !== undefined) updateData.actualBehavior = body.actualBehavior;
    if (body.tags !== undefined) updateData.tags = body.tags;

    const updated = await prismaProjects.issue.update({
      where: { id: issueId },
      data: updateData,
    });

    // Track history if status changed
    if (body.status !== undefined && body.status !== existing.status) {
      await prismaProjects.updateIssueStatus(issueId, body.status, body.changedBy);
    }

    return NextResponse.json({
      success: true,
      data: updated,
    });
  } catch (error) {
    console.error("Failed to update issue:", error);
    return NextResponse.json(
      { success: false, error: "Failed to update issue" },
      { status: 500 }
    );
  }
}

// DELETE /api/projects/[projectId]/issues/[issueId] - Delete issue
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ projectId: string; issueId: string }> }
) {
  try {
    const { issueId } = await params;
    
    await prismaProjects.issue.delete({
      where: { id: issueId },
    });

    return NextResponse.json({
      success: true,
      message: "Issue deleted",
    });
  } catch (error) {
    console.error("Failed to delete issue:", error);
    return NextResponse.json(
      { success: false, error: "Failed to delete issue" },
      { status: 500 }
    );
  }
}
