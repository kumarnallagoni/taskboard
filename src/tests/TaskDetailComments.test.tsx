import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TaskDetail } from "@/components/TaskDetail";
import * as apiClient from "@/lib/api-client";
import type { ApiTask, ApiProjectMember } from "@/types";

vi.mock("@/lib/api-client", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/api-client")>(
      "@/lib/api-client",
    );
  return {
    ...actual,
    getStoredUser: vi.fn(),
    apiFetch: vi.fn(),
  };
});

const task: ApiTask = {
  id: "t_1",
  projectId: "p_1",
  title: "Prepare launch details",
  description: "Example task",
  status: "todo",
  assigneeId: null,
  createdById: "u_1",
  position: 0,
  createdAt: "2024-01-01T00:00:00.000Z",
  updatedAt: "2024-01-01T00:00:00.000Z",
  assignee: null,
};

const members: ApiProjectMember[] = [
  {
    id: "m_1",
    role: "admin",
    user: { id: "u_1", email: "meera@taskboard.dev", name: "Meera Iyer" },
  },
];

function renderWithClient(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={client}>{ui}</QueryClientProvider>,
  );
}

describe("TaskDetail comments", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(apiClient.getStoredUser).mockReturnValue({
      id: "u_1",
      email: "meera@taskboard.dev",
      name: "Meera Iyer",
    });
  });

  it("shows loading and empty states for admin/member users", async () => {
    let resolveComments: ((value: { comments: never[] }) => void) | undefined;
    vi.mocked(apiClient.apiFetch).mockReturnValue(
      new Promise((resolve) => {
        resolveComments = resolve;
      }) as Promise<{ comments: never[] }>,
    );

    renderWithClient(
      <TaskDetail
        task={task}
        projectId="p_1"
        members={members}
        onClose={() => {}}
      />,
    );

    expect(screen.getByText("loading comments…")).toBeInTheDocument();

    resolveComments?.({ comments: [] });
    await waitFor(() =>
      expect(screen.getByText("No comments yet.")).toBeInTheDocument(),
    );
    expect(screen.getByPlaceholderText("add a comment")).toBeInTheDocument();
  });

  it("shows read-only thread for viewers and hides posting controls", async () => {
    vi.mocked(apiClient.apiFetch).mockResolvedValue({
      comments: [
        {
          id: "c_1",
          taskId: "t_1",
          authorId: "u_2",
          body: "Initial note",
          createdAt: "2024-01-01T00:00:00.000Z",
          author: { id: "u_2", name: "Arjun", email: "arjun@example.com" },
        },
      ],
    });

    renderWithClient(
      <TaskDetail
        task={task}
        projectId="p_1"
        members={[
          {
            id: "m_2",
            role: "viewer",
            user: { id: "u_2", email: "arjun@example.com", name: "Arjun" },
          },
        ]}
        onClose={() => {}}
      />,
    );

    await waitFor(() =>
      expect(screen.getByText("Initial note")).toBeInTheDocument(),
    );
    expect(screen.getByText(/Read-only thread/i)).toBeInTheDocument();
    expect(
      screen.queryByPlaceholderText("add a comment"),
    ).not.toBeInTheDocument();
  });

  it("posts a comment and refreshes the thread", async () => {
    let comments: Array<any> = [];
    vi.mocked(apiClient.apiFetch).mockImplementation(async (path, options) => {
      if (path === "/api/tasks/t_1/comments" && options?.method === "POST") {
        comments = [
          {
            id: "c_1",
            taskId: "t_1",
            authorId: "u_1",
            body: "This was posted",
            createdAt: "2024-01-02T00:00:00.000Z",
            author: {
              id: "u_1",
              name: "Meera Iyer",
              email: "meera@taskboard.dev",
            },
          },
        ];
        return { comment: comments[0] };
      }

      return { comments };
    });

    renderWithClient(
      <TaskDetail
        task={task}
        projectId="p_1"
        members={members}
        onClose={() => {}}
      />,
    );

    await waitFor(() =>
      expect(screen.getByText("No comments yet.")).toBeInTheDocument(),
    );

    fireEvent.change(screen.getByPlaceholderText("add a comment"), {
      target: { value: "This was posted" },
    });
    fireEvent.click(screen.getByRole("button", { name: "post comment" }));

    await waitFor(() =>
      expect(screen.getByText("This was posted")).toBeInTheDocument(),
    );
    expect(apiClient.apiFetch).toHaveBeenCalledWith(
      "/api/tasks/t_1/comments",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("shows an error when the comment body is blank", async () => {
    vi.mocked(apiClient.apiFetch).mockResolvedValue({ comments: [] });

    renderWithClient(
      <TaskDetail
        task={task}
        projectId="p_1"
        members={members}
        onClose={() => {}}
      />,
    );

    await waitFor(() =>
      expect(screen.getByText("No comments yet.")).toBeInTheDocument(),
    );

    fireEvent.change(screen.getByPlaceholderText("add a comment"), {
      target: { value: "   " },
    });
    fireEvent.click(screen.getByRole("button", { name: "post comment" }));

    expect(screen.getByText("comment body is required")).toBeInTheDocument();
  });
});
