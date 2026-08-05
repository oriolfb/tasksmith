import type { Bucket, ParsedTask, Task } from "../types/task";
import { addDays, daysBetween, endOfWeek, startOfToday } from "./dates";

/**
 * The rule the whole plugin hangs on. A task with no explicit date still has one when
 * it lives in a dated note, which is what stops daily-note tasks from going silently stale.
 *
 * `inherited` is the date the host note lends — from its filename, or from its `data:` when
 * the note is the kind that lends one (see `ContextRules.deadlineFrom`). Notes that only
 * record *when something was written* lend nothing here.
 */
export function effectiveDate(task: ParsedTask, inherited: Date | null): Date | null {
  return (
    task.fields.due?.date ?? task.fields.scheduled?.date ?? task.fields.start?.date ?? inherited ?? null
  );
}

/** Every open task lands in exactly one bucket; nothing can fall through. */
export function bucketOf(task: Task, today: Date = startOfToday()): Bucket {
  if (!task.open) return "closed";
  if (!task.effectiveDate) return "undated";

  const time = task.effectiveDate.getTime();
  if (time < today.getTime()) return "overdue";
  if (time === today.getTime()) return "today";
  if (time <= endOfWeek(today).getTime()) return "week";
  return "later";
}

export const BUCKET_ORDER: Bucket[] = ["overdue", "today", "week", "later", "undated", "closed"];

/**
 * Age used for staleness: creation date when present, else the note's own date, else
 * file mtime. Returns null when nothing usable is known.
 *
 * `noteDate` counts here even when it is not a deadline — that is the whole point of reading
 * it from meeting notes: "jotted down five weeks ago" is true and useful, "due five weeks ago"
 * would not be.
 */
export function ageInDays(task: Task, mtime: number | null, today: Date = startOfToday()): number | null {
  const created = task.fields.created?.date ?? task.filenameDate ?? task.noteDate;
  if (created) return daysBetween(created, today);
  if (mtime === null) return null;
  const date = new Date(mtime);
  return daysBetween(new Date(date.getFullYear(), date.getMonth(), date.getDate()), today);
}

export function isStale(task: Task, mtime: number | null, thresholdDays: number, today = startOfToday()): boolean {
  if (!task.open) return false;
  const age = ageInDays(task, mtime, today);
  return age !== null && age >= thresholdDays;
}

export function shiftDays(base: Date | null, days: number, today: Date = startOfToday()): Date {
  return addDays(base ?? today, days);
}
