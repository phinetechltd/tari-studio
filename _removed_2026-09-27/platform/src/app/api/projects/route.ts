import { NextResponse } from "next/server";
import { prismaProjects } from "@/lib/projects-db";

// GET /api/projects - List all projects with summary
export async function GET() {
  try {
    const projects = await prismaProjects.getAllProjectsSummary();
    const stats = await prismaProjects.getDashboardStats();

    return NextResponse.json({
      success: true,
      data: { projects, stats },
    });
  } catch (error) {
    console.error("Failed to fetch projects:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch projects" },
      { status: 500 }
    );
  }
}

// POST /api/projects - Create a new project
export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (!body.name || !body.slug) {
      return NextResponse.json(
        { success: false, error: "name and slug are required" },
        { status: 400 }
      );
    }
    const project = await prismaProjects.upsertProject({
      name: body.name,
      slug: body.slug,
      description: body.description || undefined,
      type: body.type || "other",
      ownerId: body.ownerId || undefined,
      baseUrl: body.baseUrl || undefined,
      healthEndpoint: body.healthEndpoint || undefined,
      healthCheckCron: body.healthCheckCron || undefined,
    });
    return NextResponse.json(
      { success: true, data: project },
      { status: 201 }
    );
  } catch (error) {
    console.error("Failed to create project:", error);
    return NextResponse.json(
      { success: false, error: "Failed to create project" },
      { status: 500 }
    );
  }
}
