import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { AirtableError, AirtableMockClient } from "@/lib/airtable-mock";
import { exportTasksToAirtableTable } from "@/lib/airtable";

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
    const airtableModule = await import("@/lib/airtable");

    vi.spyOn(airtableModule, "exportProjectTasksToAirtable").mockResolvedValue({
      created: 2,
      updated: 1,
      failed: 0,
    });

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

describe("airtable export helper", () => {
  it("maps task fields and prevents duplicate records on repeat export", async () => {
    const client = new AirtableMockClient();
    const project = { id: "project-1", name: "Q3 Launch" };
    const tasks = [
      {
        id: "task-42",
        projectId: "project-1",
        title: "Launch checklist",
        description: "Ship it",
        status: "in_progress",
        position: 7,
        createdAt: "2024-03-01T10:00:00.000Z",
        updatedAt: "2024-03-02T12:00:00.000Z",
        assignee: { name: "Asha" },
        createdBy: { name: "Meera" },
        project,
      },
    ];

    const first = await exportTasksToAirtableTable(
      client as any,
      tasks,
      project,
    );
    const second = await exportTasksToAirtableTable(
      client as any,
      tasks,
      project,
    );
    const records = client.__getRecords();

    expect(first).toEqual({ created: 1, updated: 0, failed: 0 });
    expect(second).toEqual({ created: 0, updated: 1, failed: 0 });
    expect(records[0].fields).toMatchObject({
      TaskBoardId: "task-42",
      ProjectId: "project-1",
      ProjectName: "Q3 Launch",
      Title: "Launch checklist",
      Description: "Ship it",
      Status: "in_progress",
      Assignee: "Asha",
      CreatedBy: "Meera",
      Position: 7,
    });
  });

  it("retries transient failures up to the bounded backoff limit", async () => {
    const client = new AirtableMockClient();
    const project = { id: "project-1", name: "Q3 Launch" };
    const task = {
      id: "task-99",
      projectId: "project-1",
      title: "Retry me",
      description: null,
      status: "todo",
      position: 0,
      createdAt: "2024-04-01T00:00:00.000Z",
      updatedAt: "2024-04-01T00:05:00.000Z",
    };

    let attempts = 0;
    const originalCreate = client.create.bind(client);
    vi.spyOn(client, "create").mockImplementation(async (input: any) => {
      attempts += 1;
      if (attempts < 4) {
        throw new AirtableError("rate limit retry", "rate-limit", 429);
      }
      return originalCreate(input);
    });

    const result = await exportTasksToAirtableTable(
      client as any,
      [task],
      project,
    );

    expect(attempts).toBe(4);
    expect(result).toEqual({ created: 1, updated: 0, failed: 0 });
  });

  it("does not retry permanent failures and counts them as failed", async () => {
    const client = new AirtableMockClient();
    const project = { id: "project-1", name: "Q3 Launch" };
    const task = {
      id: "task-503",
      projectId: "project-1",
      title: "Perm failure",
      description: null,
      status: "review",
      position: 1,
      createdAt: "2024-04-02T00:00:00.000Z",
      updatedAt: "2024-04-02T00:00:00.000Z",
    };

    let attempts = 0;
    vi.spyOn(client, "create").mockImplementation(async () => {
      attempts += 1;
      throw new AirtableError("bad request", "server-error", 400);
    });

    const result = await exportTasksToAirtableTable(
      client as any,
      [task],
      project,
    );

    expect(attempts).toBe(1);
    expect(result).toEqual({ created: 0, updated: 0, failed: 1 });
  });

  it("continues when one task fails while others succeed", async () => {
    const client = new AirtableMockClient();
    const project = { id: "project-1", name: "Q3 Launch" };
    const tasks = [
      {
        id: "task-ok",
        projectId: "project-1",
        title: "Good copy",
        description: "ok",
        status: "todo",
        position: 0,
        createdAt: "2024-04-03T00:00:00.000Z",
        updatedAt: "2024-04-03T00:01:00.000Z",
      },
      {
        id: "task-bad",
        projectId: "project-1",
        title: "Bad copy",
        description: "bad",
        status: "todo",
        position: 1,
        createdAt: "2024-04-03T00:00:00.000Z",
        updatedAt: "2024-04-03T00:02:00.000Z",
      },
    ];

    const originalCreate = client.create.bind(client);
    vi.spyOn(client, "create").mockImplementation(async (input: any) => {
      const payload = "fields" in input ? input.fields : input;
      if (payload.TaskBoardId === "task-bad") {
        throw new AirtableError("temporary network issue", "network", 0);
      }
      return originalCreate(input);
    });

    const result = await exportTasksToAirtableTable(
      client as any,
      tasks,
      project,
    );

    expect(result).toEqual({ created: 1, updated: 0, failed: 1 });
    expect(
      client.__getRecords().map((record) => record.fields.TaskBoardId),
    ).toContain("task-ok");
    expect(
      client.__getRecords().map((record) => record.fields.TaskBoardId),
    ).not.toContain("task-bad");
  });
});
