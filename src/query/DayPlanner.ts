import { ageInDays, bucketOf } from "../index/Buckets";
import { isEmptyTask } from "../index/EmptyTasks";
import type { Task } from "../types/task";
import { dayKey, isUrgent } from "./Focus";

export type DayPlannerReason = "overdue" | "undated";

export interface DayPlannerCandidate {
  task: Task;
  reason: DayPlannerReason;
}

export type DayPlannerStage = "choosing-today" | "day-ready" | "planning-rest";

export interface DayPlannerDataSource {
  tasks: Task[];
  /** False means the persisted startup snapshot is being shown while the live scan finishes. */
  live: boolean;
}

/**
 * The planner can start from the same persisted snapshot as the two main views. A snapshot is
 * good enough to suggest and even act on: TaskWriter verifies the source line before every write.
 * It is not good enough to prune today's saved selection, so callers also get the `live` flag.
 */
export function dayPlannerDataSource(
  indexReady: boolean,
  indexed: Task[],
  cached: Task[] | null
): DayPlannerDataSource | null {
  if (indexReady) return { tasks: indexed, live: true };
  return cached ? { tasks: cached, live: false } : null;
}

/**
 * The assistant has two distinct jobs. Three picks finish the first job; they must never leave
 * an enabled-looking "add to today" action on screen. The user can explicitly continue into
 * the second job and give the remaining unresolved tasks a date, one at a time.
 */
export function dayPlannerStage(chosen: number, planningRest: boolean): DayPlannerStage {
  if (planningRest) return "planning-rest";
  return chosen >= 3 ? "day-ready" : "choosing-today";
}

/**
 * Work that still needs a decision: overdue commitments first, then genuinely undated ones.
 * Future-dated tasks already have a decision, and urgent/today tasks already arrived in the day
 * on their own. Neither belongs in this queue.
 */
export function dayPlannerCandidates(
  tasks: Task[],
  chosenKeys: string[],
  decidedKeys: string[],
  today: Date
): DayPlannerCandidate[] {
  const chosen = new Set(chosenKeys);
  const decided = new Set(decidedKeys);
  const candidates: DayPlannerCandidate[] = [];

  for (const task of tasks) {
    const key = dayKey(task);
    if (
      !task.open ||
      task.kind !== "commitment" ||
      isEmptyTask(task) ||
      chosen.has(key) ||
      decided.has(key) ||
      isUrgent(task, today)
    ) {
      continue;
    }

    const bucket = bucketOf(task, today);
    if (bucket === "overdue" || bucket === "undated") candidates.push({ task, reason: bucket });
  }

  return candidates.sort((a, b) => {
    if (a.reason !== b.reason) return a.reason === "overdue" ? -1 : 1;
    if (a.reason === "overdue") {
      const dateA = a.task.effectiveDate?.getTime() ?? Number.POSITIVE_INFINITY;
      const dateB = b.task.effectiveDate?.getTime() ?? Number.POSITIVE_INFINITY;
      if (dateA !== dateB) return dateA - dateB;
    }
    const ageA = ageInDays(a.task, null, today) ?? -1;
    const ageB = ageInDays(b.task, null, today) ?? -1;
    return (
      ageB - ageA ||
      a.task.location.path.localeCompare(b.task.location.path) ||
      a.task.location.line - b.task.location.line
    );
  });
}
