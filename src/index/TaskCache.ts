import type { FieldKey, Task, TaskField } from "../types/task";

type SerializedField = Omit<TaskField, "date"> & { date: string | null };

type SerializedTask = Omit<Task, "noteDate" | "filenameDate" | "effectiveDate" | "fields"> & {
  noteDate: string | null;
  filenameDate: string | null;
  effectiveDate: string | null;
  fields: Partial<Record<FieldKey, SerializedField>>;
};

export interface SerializedTaskCache {
  /** Informational only — nothing reads it back to decide freshness. */
  scannedAt: string;
  tasks: SerializedTask[];
}

/**
 * The last full scan, kept across restarts so the very next launch can paint real numbers
 * immediately instead of a skeleton — see `Docs/ARCHITECTURE.md` for why this is safe despite
 * the vault having moved on: every write re-checks the line on disk before touching it.
 */
export function serializeTaskCache(tasks: Task[], scannedAt: Date): SerializedTaskCache {
  return { scannedAt: scannedAt.toISOString(), tasks: tasks.map(serializeTask) };
}

export function taskCacheFor(tasks: Task[], scannedAt: Date, enabled: boolean): SerializedTaskCache | null {
  return enabled ? serializeTaskCache(tasks, scannedAt) : null;
}

function serializeTask(task: Task): SerializedTask {
  const fields: Partial<Record<FieldKey, SerializedField>> = {};
  for (const key of Object.keys(task.fields) as FieldKey[]) {
    const field = task.fields[key];
    if (!field) continue;
    fields[key] = { ...field, date: field.date ? field.date.toISOString() : null };
  }
  return {
    ...task,
    noteDate: task.noteDate ? task.noteDate.toISOString() : null,
    filenameDate: task.filenameDate ? task.filenameDate.toISOString() : null,
    effectiveDate: task.effectiveDate ? task.effectiveDate.toISOString() : null,
    fields,
  };
}

/** Never throws: a cache from an older version or a corrupted write just falls back to `null`. */
export function deserializeTaskCache(raw: unknown): Task[] | null {
  if (!raw || typeof raw !== "object") return null;
  const tasks = (raw as { tasks?: unknown }).tasks;
  if (!Array.isArray(tasks)) return null;
  try {
    return tasks.map(deserializeTask);
  } catch {
    return null;
  }
}

function deserializeTask(raw: unknown): Task {
  const s = raw as SerializedTask;
  const fields: Task["fields"] = {};
  for (const key of Object.keys(s.fields ?? {}) as FieldKey[]) {
    const field = s.fields[key];
    if (!field) continue;
    fields[key] = { ...field, date: parseCachedDate(field.date) };
  }
  return {
    ...s,
    noteDate: parseCachedDate(s.noteDate),
    filenameDate: parseCachedDate(s.filenameDate),
    effectiveDate: parseCachedDate(s.effectiveDate),
    fields,
  };
}

function parseCachedDate(value: string | null): Date | null {
  if (value === null) return null;
  if (typeof value !== "string") throw new Error("invalid cached date");
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error("invalid cached date");
  return date;
}
