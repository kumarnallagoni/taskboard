"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch, getStoredUser } from "@/lib/api-client";
import type {
  ApiTask,
  ApiProjectMember,
  ApiTaskComment,
  TaskStatus,
} from "@/types";
import { STATUS_LABELS, STATUS_ORDER } from "@/types";

type Props = {
  task: ApiTask;
  projectId: string;
  members: ApiProjectMember[];
  onClose: () => void;
};

export function TaskDetail({ task, projectId, members, onClose }: Props) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description ?? "");
  const [status, setStatus] = useState<TaskStatus>(task.status);
  const [assigneeId, setAssigneeId] = useState<string>(task.assigneeId ?? "");
  const [commentText, setCommentText] = useState("");
  const [commentError, setCommentError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const currentUser = getStoredUser();
  const currentRole =
    members.find((m) => m.user.id === currentUser?.id)?.role ?? null;
  const canPostComments = currentRole === "admin" || currentRole === "member";

  const {
    data: commentsData,
    isLoading: commentsLoading,
    error: commentsError,
  } = useQuery({
    queryKey: ["task-comments", task.id],
    queryFn: () =>
      apiFetch<{ comments: ApiTaskComment[] }>(
        `/api/tasks/${task.id}/comments`,
      ),
  });

  const comments = commentsData?.comments ?? [];

  const postComment = useMutation({
    mutationFn: (body: string) =>
      apiFetch<{ comment: ApiTaskComment }>(`/api/tasks/${task.id}/comments`, {
        method: "POST",
        body: JSON.stringify({ body }),
      }),
    onSuccess: () => {
      setCommentText("");
      setCommentError(null);
      queryClient.invalidateQueries({ queryKey: ["task-comments", task.id] });
    },
    onError: (err) =>
      setCommentError(
        err instanceof Error ? err.message : "cannot post comment",
      ),
  });

  const updateTask = useMutation({
    mutationFn: (input: Partial<ApiTask>) =>
      apiFetch<{ task: ApiTask }>(`/api/tasks/${task.id}`, {
        method: "PATCH",
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project", projectId] });
      onClose();
    },
    onError: (err) =>
      setError(err instanceof Error ? err.message : "save failed"),
  });

  const deleteTask = useMutation({
    mutationFn: () =>
      apiFetch<{ ok: true }>(`/api/tasks/${task.id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project", projectId] });
      onClose();
    },
    onError: (err) =>
      setError(err instanceof Error ? err.message : "delete failed"),
  });

  function onSave() {
    setError(null);
    updateTask.mutate({
      title,
      description,
      status,
      assigneeId: assigneeId || null,
    });
  }

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center px-4 z-50"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl bg-surface border border-border rounded-lg p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">edit task</h2>
          <button onClick={onClose} className="text-muted hover:text-white">
            ✕
          </button>
        </div>

        <label className="block mb-3">
          <span className="text-xs text-muted">title</span>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="mt-1 block w-full rounded-md bg-bg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none"
          />
        </label>

        <label className="block mb-3">
          <span className="text-xs text-muted">description</span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            className="mt-1 block w-full rounded-md bg-bg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none"
          />
        </label>

        <div className="grid grid-cols-2 gap-3 mb-4">
          <label className="block">
            <span className="text-xs text-muted">status</span>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as TaskStatus)}
              className="mt-1 block w-full rounded-md bg-bg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none"
            >
              {STATUS_ORDER.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-xs text-muted">assignee</span>
            <select
              value={assigneeId}
              onChange={(e) => setAssigneeId(e.target.value)}
              className="mt-1 block w-full rounded-md bg-bg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none"
            >
              <option value="">unassigned</option>
              {members.map((m) => (
                <option key={m.user.id} value={m.user.id}>
                  {m.user.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        {error && (
          <p className="text-sm text-red-400 mb-3" role="alert">
            {error}
          </p>
        )}

        <div className="flex items-center justify-between gap-3">
          <button
            onClick={() => deleteTask.mutate()}
            disabled={deleteTask.isPending}
            className="text-sm text-red-400 hover:text-red-300"
          >
            delete task
          </button>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="text-sm px-4 py-2 rounded-md border border-border hover:border-muted"
            >
              cancel
            </button>
            <button
              onClick={onSave}
              disabled={updateTask.isPending}
              className="text-sm px-4 py-2 rounded-md bg-accent text-white hover:bg-indigo-500 disabled:opacity-50"
            >
              {updateTask.isPending ? "saving…" : "save"}
            </button>
          </div>
        </div>

        <section className="mt-6 border-t border-border pt-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium">comments</h3>
            <span className="text-xs text-muted">{comments.length}</span>
          </div>

          {commentsLoading && (
            <p className="text-sm text-muted">loading comments…</p>
          )}
          {!commentsLoading && commentsError && (
            <p className="text-sm text-red-400" role="alert">
              failed to load comments
            </p>
          )}
          {!commentsLoading && !commentsError && comments.length === 0 && (
            <p className="text-sm text-muted">No comments yet.</p>
          )}

          {!commentsLoading && !commentsError && comments.length > 0 && (
            <ul className="space-y-3">
              {comments.map((comment) => (
                <li
                  key={comment.id}
                  className="rounded-md border border-border bg-bg px-3 py-2"
                >
                  <div className="flex items-center justify-between text-xs text-muted mb-1">
                    <span>{comment.author.name}</span>
                    <time>{new Date(comment.createdAt).toLocaleString()}</time>
                  </div>
                  <p className="text-sm whitespace-pre-wrap">{comment.body}</p>
                </li>
              ))}
            </ul>
          )}

          {canPostComments ? (
            <div className="mt-4">
              <textarea
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                rows={3}
                placeholder="add a comment"
                className="mt-1 block w-full rounded-md bg-bg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none"
              />
              {commentError && (
                <p className="text-sm text-red-400 mt-2" role="alert">
                  {commentError}
                </p>
              )}
              <div className="flex justify-end mt-2">
                <button
                  onClick={() => {
                    setCommentError(null);
                    const trimmed = commentText.trim();
                    if (!trimmed) {
                      setCommentError("comment body is required");
                      return;
                    }
                    postComment.mutate(trimmed);
                  }}
                  disabled={postComment.isPending}
                  className="text-sm px-3 py-2 rounded-md bg-accent text-white hover:bg-indigo-500 disabled:opacity-50"
                >
                  {postComment.isPending ? "posting…" : "post comment"}
                </button>
              </div>
            </div>
          ) : (
            <p className="text-xs text-muted mt-3">
              Read-only thread. Only admins and members can post comments.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
