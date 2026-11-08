import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  getCurrentUser,
  unauthorized,
  forbidden,
  notFound,
  getProjectMembership,
  canEditTasks,
} from "@/lib/auth";
import { exportProjectTasksToAirtable } from "@/lib/airtable";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const user = await getCurrentUser(req);
  if (!user) return unauthorized();

  const { id } = await params;
  const membership = await getProjectMembership(user.id, id);
  if (!membership) return forbidden("you are not a member of this project");
  if (!canEditTasks(membership.role)) {
    return forbidden("only project admins and members may export tasks");
  }

  const project = await prisma.project.findUnique({
    where: { id },
    select: { id: true, name: true },
  });

  if (!project) return notFound("project not found");

  const tasks = await prisma.task.findMany({
    where: { projectId: id },
    include: {
      assignee: { select: { id: true, name: true, email: true } },
      createdBy: { select: { id: true, name: true, email: true } },
    },
    orderBy: [{ status: "asc" }, { position: "asc" }],
  });

  try {
    const summary = await exportProjectTasksToAirtable({
      project,
      tasks: tasks.map((task) => ({
        id: task.id,
        projectId: task.projectId,
        title: task.title,
        description: task.description,
        status: task.status,
        position: task.position,
        createdAt: task.createdAt,
        updatedAt: task.updatedAt,
        assignee: task.assignee,
        createdBy: task.createdBy,
        project,
      })),
    });

    return NextResponse.json(summary, { status: 200 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Airtable export failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
