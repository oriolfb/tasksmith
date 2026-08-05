import type { FieldKey, ParsedTask, Priority } from "../types/task";
import { MARKERS, markerForPriority, parseTaskLine } from "./TaskParser";
import { formatIsoDate } from "./dates";

/** Emoji order used by the Tasks plugin when it writes a line, so our edits look native. */
const CANONICAL_ORDER: FieldKey[] = [
  "id",
  "dependsOn",
  "priority",
  "recurrence",
  "onCompletion",
  "created",
  "start",
  "scheduled",
  "due",
  "cancelled",
  "done",
];

/**
 * Every edit returns a whole new line built from `task.raw` with one region replaced.
 * Regions the parser does not model are copied verbatim. Re-parse between chained edits.
 */
export function setField(task: ParsedTask, key: FieldKey, value: string): string {
  const marker = key === "priority" ? value : MARKERS[key];
  const text = key === "priority" ? ` ${marker}` : ` ${marker} ${value}`;

  const existing = task.fields[key];
  if (existing) {
    return task.raw.slice(0, existing.span.start) + text + task.raw.slice(existing.span.end);
  }

  const { at, resumeAt } = insertionPoint(task, key);
  return task.raw.slice(0, at) + text + task.raw.slice(resumeAt);
}

export function setDateField(task: ParsedTask, key: FieldKey, date: Date): string {
  return setField(task, key, formatIsoDate(date));
}

export function setPriority(task: ParsedTask, priority: Priority): string {
  return setField(task, "priority", markerForPriority(priority));
}

export function removeField(task: ParsedTask, key: FieldKey): string {
  const existing = task.fields[key];
  if (!existing) return task.raw;
  return task.raw.slice(0, existing.span.start) + task.raw.slice(existing.span.end);
}

export function setStatus(task: ParsedTask, status: string): string {
  return task.raw.slice(0, task.statusOffset) + status + task.raw.slice(task.statusOffset + 1);
}

/** Applies edits left to right, re-parsing after each so spans stay valid. */
export function applyEdits(line: string, edits: ((task: ParsedTask) => string)[]): string {
  let current = line;
  for (const edit of edits) {
    const task = parseTaskLine(current);
    if (!task) return current;
    current = edit(task);
  }
  return current;
}

/**
 * Where a brand-new field goes: before the first existing field that comes later in
 * canonical order, otherwise at the end of the line. When appending, `resumeAt` skips
 * the line's trailing blanks so they do not end up after the field we just wrote.
 */
function insertionPoint(task: ParsedTask, key: FieldKey): { at: number; resumeAt: number } {
  const rank = CANONICAL_ORDER.indexOf(key);
  let at = trimmedEnd(task.raw);
  let appending = true;
  for (const other of CANONICAL_ORDER) {
    if (CANONICAL_ORDER.indexOf(other) <= rank) continue;
    const field = task.fields[other];
    if (field && field.span.start < at) {
      at = field.span.start;
      appending = false;
    }
  }
  return { at, resumeAt: appending ? task.raw.length : at };
}

function trimmedEnd(line: string): number {
  let end = line.length;
  while (end > 0 && (line[end - 1] === " " || line[end - 1] === "\t")) end--;
  return end;
}
