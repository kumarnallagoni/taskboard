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
