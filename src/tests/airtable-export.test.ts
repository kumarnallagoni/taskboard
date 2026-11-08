import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getCurrentUser = vi.fn();
const getProjectMembership = vi.fn();
const prisma = {
  project: { findUnique: vi.fn() },
  task: { findMany: vi.fn() },
};

vi.mock("@/lib/auth", () => ({
  getCurrentUser,
  getProjectMembership,
  unauthorized: () =>
    new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 }),
  forbidden: (message: string) =>
    new Response(JSON.stringify({ error: message }), { status: 403 }),
  notFound: (message: string) =>
    new Response(JSON.stringify({ error: message }), { status: 404 }),
  badRequest: (message: string) =>
    new Response(JSON.stringify({ error: message }), { status: 400 }),
  canEditTasks: (role: string | null | undefined) =>
    role === "admin" || role === "member",
}));

vi.mock("@/lib/prisma", () => ({ prisma }));

vi.mock("@/lib/airtable", () => ({
  exportProjectTasksToAirtable: vi.fn(async () => ({
    created: 2,
    updated: 1,
    failed: 0,
  })),
}));

describe("project Airtable export", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects viewers from exporting tasks", async () => {
    const { POST } = await import("@/app/api/projects/[id]/export/route");

    getCurrentUser.mockResolvedValue({
      id: "u-1",
      email: "viewer@example.com",
      name: "Viewer",
    });
    getProjectMembership.mockResolvedValue({ role: "viewer" });

    const req = new NextRequest(
      "http://localhost/api/projects/project-1/export",
      { method: "POST" },
    );
    const res = await POST(req, {
      params: Promise.resolve({ id: "project-1" }),
    });

    expect(res.status).toBe(403);
  });

  it("returns created, updated, and failed counts for successful export", async () => {
    const { POST } = await import("@/app/api/projects/[id]/export/route");
    const { exportProjectTasksToAirtable } = await import("@/lib/airtable");

    getCurrentUser.mockResolvedValue({
      id: "u-1",
      email: "admin@example.com",
      name: "Admin",
    });
    getProjectMembership.mockResolvedValue({ role: "admin" });
    prisma.project.findUnique.mockResolvedValue({
      id: "project-1",
      name: "Q3 Launch",
    });
    prisma.task.findMany.mockResolvedValue([
      {
        id: "task-1",
        projectId: "project-1",
        title: "Alpha",
        description: "first",
        status: "todo",
        assigneeId: null,
        createdById: "u-1",
        position: 0,
        createdAt: new Date("2024-03-01T10:00:00Z"),
        updatedAt: new Date("2024-03-02T10:00:00Z"),
        assignee: null,
        createdBy: { id: "u-1", name: "Admin", email: "admin@example.com" },
      },
      {
        id: "task-2",
        projectId: "project-1",
        title: "Beta",
        description: "second",
        status: "done",
        assigneeId: null,
        createdById: "u-1",
        position: 1,
        createdAt: new Date("2024-03-03T10:00:00Z"),
        updatedAt: new Date("2024-03-07T10:00:00Z"),
        assignee: null,
        createdBy: { id: "u-1", name: "Admin", email: "admin@example.com" },
      },
    ]);
    vi.mocked(exportProjectTasksToAirtable).mockResolvedValue({
      created: 2,
      updated: 1,
      failed: 0,
    });

    const req = new NextRequest(
      "http://localhost/api/projects/project-1/export",
      { method: "POST" },
    );
    const res = await POST(req, {
      params: Promise.resolve({ id: "project-1" }),
    });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toMatchObject({ created: 2, updated: 1, failed: 0 });
  });
});
