import type { Task } from "../types/task";
import { bucketOf } from "../index/Buckets";
import { isEmptyTask } from "../index/EmptyTasks";
import { daysBetween, startOfToday } from "../index/dates";

/**
 * The numbers behind the control centre's KPI strip and throughput chart.
 *
 * Pure, like `Focus.ts`, for the same reason: the vault audit runs it over the real vault, so
 * the figures the panel shows and the figures CI prints cannot drift apart.
 *
 * Everything here counts **commitments only** — documentation checklists and someday lines are
 * kept in the vault and stay out of every count, exactly as `bucketCounts` does it. A ticked
 * checklist inside a documentation note is not throughput.
 */

export function commitments(tasks: Task[]): Task[] {
  return tasks.filter((task) => !isEmptyTask(task) && task.kind === "commitment");
}

export interface OpenState {
  open: number;
  /** How many notes those open tasks live in: "40 obertes en 24 notes". */
  notes: number;
  /** Past their date. Not failures — decisions not yet made. */
  renegotiate: number;
  /** Days past the date of the oldest overdue task; null when there is none. */
  oldestOverdueDays: number | null;
  undated: number;
  /**
   * Undated tasks whose host note records a `data:` the plugin does not treat as a deadline.
   * One guarded write each puts that date on the task, which is the health panel's one-click fix.
   */
  datableFromNote: number;
}

export function openState(tasks: Task[], today: Date = startOfToday()): OpenState {
  const open = commitments(tasks).filter((task) => task.open);
  const overdue = open.filter((task) => bucketOf(task, today) === "overdue");
  const undated = open.filter((task) => bucketOf(task, today) === "undated");

  const ages = overdue.map((task) => daysBetween(task.effectiveDate!, today));
  return {
    open: open.length,
    notes: new Set(open.map((task) => task.location.path)).size,
    renegotiate: overdue.length,
    oldestOverdueDays: ages.length > 0 ? Math.max(...ages) : null,
    undated: undated.length,
    datableFromNote: undated.filter((task) => task.noteDate !== null).length,
  };
}

/** The undated tasks a single write could date, so the health panel can act on exactly those. */
export function datableFromNote(tasks: Task[], today: Date = startOfToday()): Task[] {
  return commitments(tasks).filter(
    (task) => task.open && bucketOf(task, today) === "undated" && task.noteDate !== null
  );
}

export interface ClosingState {
  /** Every closed commitment line, dated or not. */
  closed: number;
  /** Closed with `✅`. */
  done: number;
  /** Cancelled: `- [-]`, usually with `❌`. Saying "no" is a decision, so it counts as closing. */
  cancelled: number;
  /** Earliest closing date on record; null when nothing carries one. */
  first: Date | null;
  last: Date | null;
  lastCancelled: Date | null;
  /**
   * Measured capacity: dated closings per working day since the first one. This is the number
   * the focus view's three slots come from — it is why there are three and not ten.
   */
  perWorkingDay: number | null;
}

export function closingState(tasks: Task[], today: Date = startOfToday()): ClosingState {
  const closed = commitments(tasks).filter((task) => !task.open);

  let done = 0;
  let cancelled = 0;
  let first: Date | null = null;
  let last: Date | null = null;
  let lastCancelled: Date | null = null;
  let dated = 0;

  for (const task of closed) {
    const wasCancelled = isCancelled(task);
    if (wasCancelled) cancelled++;
    else done++;

    const when = closingDate(task);
    if (!when || when.getTime() > today.getTime()) continue;
    dated++;
    if (!first || when.getTime() < first.getTime()) first = when;
    if (!last || when.getTime() > last.getTime()) last = when;
    if (wasCancelled && (!lastCancelled || when.getTime() > lastCancelled.getTime())) lastCancelled = when;
  }

  const workingDays = first ? workingDaysBetween(first, today) : 0;
  return {
    closed: closed.length,
    done,
    cancelled,
    first,
    last,
    lastCancelled,
    perWorkingDay: workingDays > 0 ? dated / workingDays : null,
  };
}

/** `- [-]` is the cancelled status; `❌` is the date the Tasks plugin writes beside it. */
export function isCancelled(task: Task): boolean {
  return task.status === "-" || task.fields.cancelled !== undefined;
}

export function closingDate(task: Task): Date | null {
  return task.fields.done?.date ?? task.fields.cancelled?.date ?? null;
}

export interface MonthlyClosed {
  year: number;
  /** 0-based, like `Date.getMonth()`. */
  month: number;
  done: number;
  cancelled: number;
  total: number;
  /** The month in progress, which is why its bar is always the short one. */
  current: boolean;
}

/**
 * Closed per month, ending with the month `today` falls in. Months with nothing in them are
 * kept as zeros: a gap in the chart is information, and dropping it would slide the axis.
 */
export function monthlyClosed(tasks: Task[], today: Date = startOfToday(), months = 8): MonthlyClosed[] {
  const series: MonthlyClosed[] = [];
  const index = new Map<string, MonthlyClosed>();

  for (let back = months - 1; back >= 0; back--) {
    const date = new Date(today.getFullYear(), today.getMonth() - back, 1);
    const entry: MonthlyClosed = {
      year: date.getFullYear(),
      month: date.getMonth(),
      done: 0,
      cancelled: 0,
      total: 0,
      current: back === 0,
    };
    series.push(entry);
    index.set(monthKey(date.getFullYear(), date.getMonth()), entry);
  }

  for (const task of commitments(tasks)) {
    if (task.open) continue;
    const when = closingDate(task);
    if (!when) continue;
    const entry = index.get(monthKey(when.getFullYear(), when.getMonth()));
    if (!entry) continue;
    if (isCancelled(task)) entry.cancelled++;
    else entry.done++;
    entry.total++;
  }

  return series;
}

function monthKey(year: number, month: number): string {
  return `${year}-${month}`;
}

/** Monday to Friday, both ends included. Holidays are not modelled: nobody's are. */
export function workingDaysBetween(from: Date, to: Date): number {
  const span = daysBetween(from, to);
  if (span < 0) return 0;
  let count = 0;
  for (let i = 0; i <= span; i++) {
    const day = new Date(from.getFullYear(), from.getMonth(), from.getDate() + i).getDay();
    if (day !== 0 && day !== 6) count++;
  }
  return count;
}

/** Whole months between two dates, for "cap tasca cancel·lada en 8 mesos". */
export function monthsBetween(from: Date, to: Date): number {
  const months = (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
  return Math.max(0, to.getDate() < from.getDate() ? months - 1 : months);
}
