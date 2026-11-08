import Airtable, { type FieldSet } from "airtable";

export type AirtableExportSummary = {
  created: number;
  updated: number;
  failed: number;
};

export type AirtableTaskLike = {
  id: string;
  projectId: string;
  title: string;
  description: string | null;
  status: string;
  position: number;
  createdAt: Date | string;
  updatedAt: Date | string;
  assignee?: { name?: string | null } | null;
  createdBy?: { name?: string | null } | null;
  project?: { name?: string | null } | null;
};

export type AirtableTableLike = {
  create: (fields: FieldSet) => Promise<{ id: string }>;
  update: (id: string, fields: FieldSet) => Promise<{ id: string }>;
  select: (options: { fields?: string[]; pageSize?: number }) => {
    eachPage: (
      onPage: (
        records: Array<{ id: string; get: (field: string) => unknown }>,
        fetchNextPage: () => void,
      ) => void,
      onDone: (error?: unknown) => void,
    ) => void;
  };
};

export type AirtableExportOptions = {
  apiKey?: string;
  baseId?: string;
  tableName?: string;
  tasks: AirtableTaskLike[];
  project: { id: string; name: string };
};

const RETRYABLE_STATUS_CODES = new Set([408, 429, 500, 502, 503, 504]);
const PERMANENT_STATUS_CODES = new Set([400, 401, 403, 404, 422]);

export async function exportProjectTasksToAirtable({
  apiKey = process.env.AIRTABLE_API_KEY,
  baseId = process.env.AIRTABLE_BASE_ID,
  tableName = process.env.AIRTABLE_TABLE_NAME ?? "Tasks",
  tasks,
  project,
}: AirtableExportOptions): Promise<AirtableExportSummary> {
  if (!apiKey) {
    throw new Error("AIRTABLE_API_KEY is not configured");
  }
  if (!baseId) {
    throw new Error("AIRTABLE_BASE_ID is not configured");
  }

  const base = new Airtable({ apiKey }).base(baseId);
  const table = base(tableName) as unknown as AirtableTableLike;
  return exportTasksToAirtableTable(table, tasks, project);
}

export async function exportTasksToAirtableTable(
  table: AirtableTableLike,
  tasks: AirtableTaskLike[],
  project: { id: string; name: string },
): Promise<AirtableExportSummary> {
  const existingByTaskId = await getExistingTaskIdMap(table);

  let created = 0;
  let updated = 0;
  let failed = 0;

  for (const task of tasks) {
    const fields = toAirtableFields(task, project);

    try {
      const existingRecordId = existingByTaskId.get(task.id);
      if (existingRecordId) {
        await withRetry(() => table.update(existingRecordId, fields));
        updated += 1;
      } else {
        await withRetry(() => table.create(fields));
        created += 1;
      }
    } catch (error) {
      failed += 1;
      console.warn("Airtable task export failed for task", task.id, error);
    }
  }

  return { created, updated, failed };
}

function toAirtableFields(
  task: AirtableTaskLike,
  project: { id: string; name: string },
): FieldSet {
  return {
    TaskBoardId: task.id,
    ProjectId: task.projectId ?? project.id,
    ProjectName: task.project?.name ?? project.name,
    Title: task.title,
    Description: task.description ?? "",
    Status: task.status,
    Assignee: task.assignee?.name ?? "",
    CreatedBy: task.createdBy?.name ?? "",
    Position: task.position,
    CreatedAt: toIsoString(task.createdAt),
    UpdatedAt: toIsoString(task.updatedAt),
  };
}

async function getExistingTaskIdMap(table: AirtableTableLike) {
  const map = new Map<string, string>();

  await new Promise<void>((resolve, reject) => {
    table
      .select({
        pageSize: 100,
        fields: ["TaskBoardId"],
      })
      .eachPage(
        (records, fetchNextPage) => {
          for (const record of records) {
            const taskId = String(record.get("TaskBoardId") ?? "").trim();
            if (taskId) {
              map.set(taskId, record.id);
            }
          }
          fetchNextPage();
        },
        (error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        },
      );
  });

  return map;
}

async function withRetry<T>(operation: () => Promise<T>): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= 3; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (!isTransientFailure(error) || attempt >= 3) {
        throw error;
      }
      const backoffMs = 200 * 2 ** attempt;
      await delay(backoffMs);
    }
  }

  throw lastError;
}

function isTransientFailure(error: unknown): boolean {
  const statusCode =
    typeof error === "object" && error !== null && "statusCode" in error
      ? Number((error as { statusCode?: number }).statusCode)
      : 0;
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "";

  if (PERMANENT_STATUS_CODES.has(statusCode)) {
    return false;
  }

  if (RETRYABLE_STATUS_CODES.has(statusCode)) {
    return true;
  }

  const text = message.toLowerCase();
  return (
    text.includes("rate limit") ||
    text.includes("timeout") ||
    text.includes("network") ||
    text.includes("ecconnreset") ||
    text.includes("fetch failed")
  );
}

function toIsoString(value: Date | string): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return Number.isNaN(date.getTime())
    ? new Date(0).toISOString()
    : date.toISOString();
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
