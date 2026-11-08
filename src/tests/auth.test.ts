import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { PATCH } from "@/app/api/tasks/[id]/route";
import { getCurrentUser, getProjectMembership } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { signToken, verifyToken } from "@/lib/jwt";

vi.mock("@/lib/auth", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/auth")>("@/lib/auth");
  return {
    ...actual,
    getCurrentUser: vi.fn(),
    getProjectMembership: vi.fn(),
  };
});

vi.mock("@/lib/prisma", () => ({
  prisma: {
    task: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    taskComment: {
      create: vi.fn(),
      findMany: vi.fn(),
    },
  },
}));

describe("jwt", () => {
  it("round-trips a payload", () => {
    const token = signToken({ userId: "u_1", email: "a@b.com" });
    const decoded = verifyToken(token);
    expect(decoded?.userId).toBe("u_1");
    expect(decoded?.email).toBe("a@b.com");
  });

  it("returns null for an invalid token", () => {
    expect(verifyToken("not.a.real.token")).toBeNull();
  });
});

describe("task authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects updating a task when the user is not a member of its project", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({
      id: "user-1",
      email: "viewer@example.com",
      name: "Viewer User",
    });
    vi.mocked(getProjectMembership).mockResolvedValue(null);
    vi.mocked(prisma.task.findUnique).mockResolvedValue({
      id: "task-1",
      projectId: "project-2",
      title: "Existing task",
      description: "Original",
      status: "todo",
      assigneeId: null,
      createdById: "owner-1",
      position: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const req = new NextRequest("http://localhost/api/tasks/task-1", {
      method: "PATCH",
      body: JSON.stringify({ title: "Hacked" }),
      headers: { "Content-Type": "application/json" },
    });

    const res = await PATCH(req, { params: Promise.resolve({ id: "task-1" }) });

    expect(res.status).toBe(403);
    expect(prisma.task.update).not.toHaveBeenCalled();
  });
});

describe("task comments", () => {
  it("rejects viewers from posting comments", async () => {
    const { POST } = await import("@/app/api/tasks/[id]/comments/route");
    vi.mocked(getCurrentUser).mockResolvedValue({
      id: "user-1",
      email: "viewer@example.com",
      name: "Viewer User",
    });
    vi.mocked(getProjectMembership).mockResolvedValue({ role: "viewer" });
    vi.mocked(prisma.task.findUnique).mockResolvedValue({
      id: "task-1",
      projectId: "project-1",
      title: "Existing task",
      description: "Original",
      status: "todo",
      assigneeId: null,
      createdById: "owner-1",
      position: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const req = new NextRequest("http://localhost/api/tasks/task-1/comments", {
      method: "POST",
      body: JSON.stringify({ body: "This should fail" }),
      headers: { "Content-Type": "application/json" },
    });

    const res = await POST(req, { params: Promise.resolve({ id: "task-1" }) });

    expect(res.status).toBe(403);
  });

  it("validates empty comment payloads before creating a comment", async () => {
    const { POST } = await import("@/app/api/tasks/[id]/comments/route");
    vi.mocked(getCurrentUser).mockResolvedValue({
      id: "user-1",
      email: "admin@example.com",
      name: "Admin User",
    });
    vi.mocked(getProjectMembership).mockResolvedValue({ role: "admin" });
    vi.mocked(prisma.task.findUnique).mockResolvedValue({
      id: "task-1",
      projectId: "project-1",
      title: "Existing task",
      description: "Original",
      status: "todo",
      assigneeId: null,
      createdById: "owner-1",
      position: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const req = new NextRequest("http://localhost/api/tasks/task-1/comments", {
      method: "POST",
      body: JSON.stringify({ body: "   " }),
      headers: { "Content-Type": "application/json" },
    });

    const res = await POST(req, { params: Promise.resolve({ id: "task-1" }) });

    expect(res.status).toBe(400);
    expect(prisma.taskComment.create).not.toHaveBeenCalled();
  });

  it("returns comments oldest-first with author metadata", async () => {
    const { GET } = await import("@/app/api/tasks/[id]/comments/route");
    vi.mocked(getCurrentUser).mockResolvedValue({
      id: "user-1",
      email: "member@example.com",
      name: "Member User",
    });
    vi.mocked(getProjectMembership).mockResolvedValue({ role: "member" });
    vi.mocked(prisma.task.findUnique).mockResolvedValue({
      id: "task-1",
      projectId: "project-1",
      title: "Existing task",
      description: "Original",
      status: "todo",
      assigneeId: null,
      createdById: "owner-1",
      position: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    vi.mocked(prisma.taskComment.findMany).mockResolvedValue([
      {
        id: "c1",
        taskId: "task-1",
        authorId: "user-1",
        body: "First",
        createdAt: new Date("2024-01-01T00:00:00Z"),
        author: {
          id: "user-1",
          name: "Member User",
          email: "member@example.com",
        },
      } as any,
      {
        id: "c2",
        taskId: "task-1",
        authorId: "user-2",
        body: "Second",
        createdAt: new Date("2024-01-02T00:00:00Z"),
        author: {
          id: "user-2",
          name: "Second User",
          email: "second@example.com",
        },
      } as any,
    ]);

    const req = new NextRequest("http://localhost/api/tasks/task-1/comments");
    const res = await GET(req, { params: Promise.resolve({ id: "task-1" }) });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.comments[0].body).toBe("First");
    expect(json.comments[1].body).toBe("Second");
    expect(json.comments[0].author.name).toBe("Member User");
  });
});
