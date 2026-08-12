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
  return matchesUrgentCriteria(task, today);
}

/**
 * Whether a task would be urgent if it were still open. `isUrgent` itself must stay false for a
 * closed task — a finished task is never something that still needs a slot — but `DaySelection`
 * needs to ask this same question about a task that just closed, to tell "arrived on its own and
 * got ticked off before you got to it" from an ordinary closed task that never earned a place in
 * today's record.
 */
export function wasUrgent(task: Task, today: Date = startOfToday()): boolean {
  return matchesUrgentCriteria(task, today);
}

function matchesUrgentCriteria(task: Task, today: Date): boolean {
  if (bucketOf({ ...task, open: true }, today) === "today") return true;
  if (task.priority === "highest") return true;
  return task.tags.some((tag) => URGENT_TAGS.includes(tag.toLowerCase()));
}

export interface FocusSections {
  /**
   * Arrived on their own: today's date, highest priority, or an urgent tag — and not chosen.
   * Once you press «Avui» on one it moves to `chosen`, takes a number and holds a slot.
   */
  urgent: Task[];
  /** The ones you picked and have not finished yet, in the order you picked them. */
  chosen: Task[];
  /**
   * Chosen tasks you have since finished. Kept apart from `done`, and from `chosen`, because
   * finishing one frees its slot for another pick (see `DaySelection`) without it losing the
   * ordinal it was given — it stays exactly where it was, struck through, instead of jumping to
   * the closed list at the foot.
   */
  doneChosen: Task[];
  /** How many of the three slots are still free. */
  free: number;
  /**
   * Ticked off today without ever holding a slot — i.e. arrived on their own and finished before
   * you got to them. The only closed tasks the focus view shows outside `doneChosen`: they stay in
   * "Avui", struck through, at the foot, because three empty slots at six in the evening look
   * exactly like three at nine in the morning — and that reads as a day where nothing happened.
   */
  done: Task[];
  /** Past their date. Not a failure — a decision you have not made yet. */
  renegotiate: Task[];
  undated: Task[];
  later: Task[];
  /**
   * Ordinal for every key that has ever held a slot today, chosen or since finished, in pick
   * order. Derived from `slotted` rather than from `chosen` so a task's number never shifts when
   * an earlier pick is finished and its slot reopens.
   */
  ordinals: Map<string, number>;
}

export interface FocusInput {
  tasks: Task[];
  /** Keys of the tasks chosen for today, in order. See `DaySelection`. */
  chosen: string[];
  /** Keys ticked off today, in the order they fell. See `DaySelection`. */
  done?: string[];
  /**
   * Every key that has held one of today's three slots at some point, in the order it was first
   * picked — including keys since finished, which `chosen` alone would have already forgotten.
   * See `DaySelection.slottedKeys`.
   */
  slotted?: string[];
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
  const slottedOrder = input.slotted ?? [];
  const slottedKeys = new Set(slottedOrder);
  const needle = (input.text ?? "").trim().toLowerCase();

  const urgent: Task[] = [];
  const chosen: Task[] = [];
  const doneChosen: Task[] = [];
  const done: Task[] = [];
  const renegotiate: Task[] = [];
  const undated: Task[] = [];
  const later: Task[] = [];

  for (const task of input.tasks) {
    if (isEmptyTask(task) || task.kind !== "commitment") continue;
    if (needle && !matches(task, needle)) continue;

    /*
     * Closed tasks stay out of the view, with one exception: the ones you ticked off today from
     * "Avui". They are the day's record. A closed task that once held a slot (`slotted`) is kept
     * apart from the rest: it stays with `chosen`'s ordinal instead of falling in with tasks that
     * arrived on their own and were closed before you ever got to your three.
     */
    if (!task.open) {
      if (doneKeys.has(dayKey(task))) {
        if (slottedKeys.has(dayKey(task))) doneChosen.push(task);
        else done.push(task);
      }
      continue;
    }

    /*
     * A task can be both urgent and chosen, and it should only appear once. Choosing wins:
     * urgency put the task in front of you, but pressing «Avui» on it is you saying it is one of
     * your three. When urgency won, the task kept its place in the list, never took a number, and
     * the counter stayed at "0 de 3" — pressing «Avui» looked like it did nothing at all.
     */
    if (chosenKeys.has(dayKey(task))) {
      chosen.push(task);
      continue;
    }
    if (isUrgent(task, today)) {
      urgent.push(task);
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
  const slotOrder = (task: Task): number => slottedOrder.indexOf(dayKey(task));
  doneChosen.sort((a, b) => slotOrder(a) - slotOrder(b));
  const fell = (task: Task): number => doneOrder.indexOf(dayKey(task));
  done.sort((a, b) => fell(a) - fell(b));

  // Oldest first everywhere else, so nothing rots at the bottom of a list.
  urgent.sort(byAge(today));
  renegotiate.sort(byAge(today));
  later.sort((a, b) => (a.effectiveDate?.getTime() ?? 0) - (b.effectiveDate?.getTime() ?? 0));

  const ordinals = new Map<string, number>();
  slottedOrder.forEach((key, i) => ordinals.set(key, i + 1));

  return {
    urgent,
    chosen,
    doneChosen,
    // A finished task no longer holds a slot: you can pick another one if you want to.
    free: Math.max(0, DAY_LIMIT - chosen.length),
    done,
    renegotiate,
    undated,
    later,
    ordinals,
  };
}

/**
 * Identity for the day's selection: the note plus the task's text.
 *
 * Not `path:line`, which the renderer uses for a single paint — line numbers shift the moment
 * you type a line above the task, and this selection has to survive that for a whole day.
 */
export function dayKey(task: Task): string {
  return `${task.location.path}|${task.identityDescription.trim()}`;
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
