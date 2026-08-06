import type { Task } from "../types/task";
import { bucketOf } from "../index/Buckets";
import { isEmptyTask } from "../index/EmptyTasks";
import { startOfToday } from "../index/dates";

/** How many tasks you can commit to in a day. Measured: 2.5 closed per working day. */
export const DAY_LIMIT = 3;

const URGENT_TAGS = ["#urgent", "#urgente"];

/**
 * A task that puts itself on today's list, without being chosen.
 *
 * This is the hole the first design had: if "today" only contains what you picked, something
 * genuinely urgent could sit unseen in the pool. These arrive on their own, go first, and do
 * **not** consume one of the three slots.
 */
export function isUrgent(task: Task, today: Date = startOfToday()): boolean {
  if (!task.open) return false;
  if (bucketOf(task, today) === "today") return true;
  if (task.priority === "highest") return true;
  return task.tags.some((tag) => URGENT_TAGS.includes(tag.toLowerCase()));
}

export interface FocusSections {
  /** Arrived on their own: today's date, highest priority, or an urgent tag. */
  urgent: Task[];
  /** The ones you picked, in the order you picked them. */
  chosen: Task[];
  /** How many of the three slots are still free. */
  free: number;
  /**
   * Ticked off today, in the order they fell. The only closed tasks the focus view shows: they
   * stay in "Avui", struck through, because three empty slots at six in the evening look exactly
   * like three at nine in the morning — and that reads as a day where nothing happened.
   */
  done: Task[];
  /** Past their date. Not a failure — a decision you have not made yet. */
  renegotiate: Task[];
  undated: Task[];
  later: Task[];
}

export interface FocusInput {
  tasks: Task[];
  /** Keys of the tasks chosen for today, in order. See `DaySelection`. */
  chosen: string[];
  /** Keys ticked off today, in the order they fell. See `DaySelection`. */
  done?: string[];
  today: Date;
  /** Free text filter, applied to every section at once. */
  text?: string;
}

/**
 * Splits the open commitments into the four things the focus view shows. Pure, so the audit
 * and the unit tests see exactly what the view does.
 */
export function focusSections(input: FocusInput): FocusSections {
  const { today } = input;
  const chosenKeys = new Set(input.chosen);
  const doneOrder = input.done ?? [];
  const doneKeys = new Set(doneOrder);
  const needle = (input.text ?? "").trim().toLowerCase();

  const urgent: Task[] = [];
  const chosen: Task[] = [];
  const done: Task[] = [];
  const renegotiate: Task[] = [];
  const undated: Task[] = [];
  const later: Task[] = [];

  for (const task of input.tasks) {
    if (isEmptyTask(task) || task.kind !== "commitment") continue;
    if (needle && !matches(task, needle)) continue;

    /*
     * Closed tasks stay out of the view, with one exception: the ones you ticked off today from
     * "Avui". They are the day's record. Everything else closed belongs to the wide view.
     */
    if (!task.open) {
      if (doneKeys.has(dayKey(task))) done.push(task);
      continue;
    }

    // Urgency wins over being chosen: a task can be both, and it should only appear once.
    if (isUrgent(task, today)) {
      urgent.push(task);
      continue;
    }
    if (chosenKeys.has(dayKey(task))) {
      chosen.push(task);
      continue;
    }

    switch (bucketOf(task, today)) {
      case "overdue":
        renegotiate.push(task);
        break;
      case "undated":
        undated.push(task);
        break;
      default:
        later.push(task);
    }
  }

  const order = (task: Task): number => input.chosen.indexOf(dayKey(task));
  chosen.sort((a, b) => order(a) - order(b));
  const fell = (task: Task): number => doneOrder.indexOf(dayKey(task));
  done.sort((a, b) => fell(a) - fell(b));

  // Oldest first everywhere else, so nothing rots at the bottom of a list.
  urgent.sort(byAge(today));
  renegotiate.sort(byAge(today));
  later.sort((a, b) => (a.effectiveDate?.getTime() ?? 0) - (b.effectiveDate?.getTime() ?? 0));

  return {
    urgent,
    chosen,
    // A finished task no longer holds a slot: you can pick another one if you want to.
    free: Math.max(0, DAY_LIMIT - chosen.length),
    done,
    renegotiate,
    undated,
    later,
  };
}

/**
 * Identity for the day's selection: the note plus the task's text.
 *
 * Not `path:line`, which the renderer uses for a single paint — line numbers shift the moment
 * you type a line above the task, and this selection has to survive that for a whole day.
 */
export function dayKey(task: Task): string {
  return `${task.location.path}|${task.description.trim()}`;
}

function byAge(today: Date): (a: Task, b: Task) => number {
  return (a, b) => {
    const at = a.effectiveDate?.getTime() ?? Number.POSITIVE_INFINITY;
    const bt = b.effectiveDate?.getTime() ?? Number.POSITIVE_INFINITY;
    return at - bt;
  };
}

function matches(task: Task, needle: string): boolean {
  const haystack = `${task.description} ${task.location.path} ${task.noteTitle ?? ""} ${task.people.join(" ")}`;
  return haystack.toLowerCase().includes(needle);
}
