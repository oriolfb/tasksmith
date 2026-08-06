import type { Task } from "../types/task";
import { bucketOf, originDate } from "../index/Buckets";
import { isEmptyTask } from "../index/EmptyTasks";
import { addDays, daysBetween, formatIsoDate, startOfToday } from "../index/dates";

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

export interface DayLoad {
  date: Date;
  /** `YYYY-MM-DD` of the column's own day. */
  iso: string;
  /**
   * Every day this column stands for, its own first. More than one only when weekends are
   * hidden and this Monday is carrying them; this is what the `dueOn` filter takes, so the
   * table a click opens holds exactly the tasks the column counted.
   */
  days: string[];
  /** Open commitments dated on any of `days`. */
  count: number;
  /** How many of those came from a folded weekend rather than from the column's own day. */
  absorbed: number;
  today: boolean;
  weekend: boolean;
}

export interface WeekAhead {
  days: DayLoad[];
  /** Open and already past their date: the debt the week starts with, before any of it. */
  overdue: number;
  /** Dated after the last day of the strip. */
  later: number;
  undated: number;
  /** Everything inside the strip. */
  planned: number;
  /** The busiest day, for scaling the bars. */
  peak: number;
}

export interface WeekOptions {
  /** How many columns. */
  span?: number;
  /**
   * Give Saturday and Sunday a column of their own. Off, the strip runs over working days and
   * each skipped weekend day is folded into the column that follows it.
   */
  weekends?: boolean;
}

function isWeekend(date: Date): boolean {
  const day = date.getDay();
  return day === 0 || day === 6;
}

/**
 * How the days ahead are loaded, one column per day starting today.
 *
 * Rolling, not Monday-to-Sunday: the question is "what is coming at me", and on a Thursday a
 * calendar week answers it with three days. The counts are of **dates**, not of work — a day
 * with six tasks on it is a day six things were promised for, which is exactly the thing worth
 * seeing before it arrives.
 *
 * With `weekends: false` the columns are working days, but the weekend is **folded, not
 * dropped**: a task dated on a Saturday is counted in the Monday that follows, and that Monday
 * carries all three dates in `days` so the filter behind it agrees with the number on it. Today
 * always keeps its column even when it is a Saturday — it is the day you are standing on, and a
 * strip that starts on Monday when it is Saturday answers a question nobody asked.
 */
export function weekAhead(tasks: Task[], today: Date = startOfToday(), options: WeekOptions = {}): WeekAhead {
  const span = options.span ?? 7;
  const weekends = options.weekends ?? true;
  const open = commitments(tasks).filter((task) => task.open);

  const days: DayLoad[] = [];
  const index = new Map<string, DayLoad>();
  // Days a hidden weekend has left waiting for the next working column. Kept in order, so the
  // Monday that takes them lists Saturday and Sunday before itself.
  let pending: string[] = [];

  for (let offset = 0; days.length < span; offset++) {
    const date = addDays(today, offset);
    const iso = formatIsoDate(date);
    const skipped = !weekends && isWeekend(date) && offset > 0;
    if (skipped) {
      pending.push(iso);
      continue;
    }

    const entry: DayLoad = {
      date,
      iso,
      days: [...pending, iso],
      count: 0,
      absorbed: 0,
      today: offset === 0,
      weekend: isWeekend(date),
    };
    for (const day of entry.days) index.set(day, entry);
    pending = [];
    days.push(entry);
  }

  let overdue = 0;
  let later = 0;
  let undated = 0;
  for (const task of open) {
    const when = task.effectiveDate;
    if (!when) {
      undated++;
      continue;
    }
    if (when.getTime() < today.getTime()) {
      overdue++;
      continue;
    }
    const iso = formatIsoDate(when);
    const day = index.get(iso);
    if (!day) later++;
    else {
      day.count++;
      if (iso !== day.iso) day.absorbed++;
    }
  }

  return {
    days,
    overdue,
    later,
    undated,
    planned: days.reduce((sum, day) => sum + day.count, 0),
    peak: Math.max(0, ...days.map((day) => day.count)),
  };
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

export interface MonthlyFlow {
  year: number;
  /** 0-based, like `Date.getMonth()`. */
  month: number;
  /** Commitments whose origin date falls in the month, whatever state they are in now. */
  created: number;
  /** Of those, the ones still open today: the part of that month that never got resolved. */
  stillOpen: number;
  done: number;
  cancelled: number;
  /** `done + cancelled`, i.e. everything that stopped being pending that month. */
  closed: number;
  /** The month in progress, which is why its bars are always the short ones. */
  current: boolean;
}

/**
 * In and out per month, ending with the month `today` falls in. Months with nothing in them
 * are kept as zeros: a gap in the chart is information, and dropping it would slide the axis.
 *
 * The two series answer different questions and are counted by different dates — `created` by
 * the task's origin date (see `originDate`), `closed` by its ✅/❌. A month where the first bar
 * beats the second is a month the backlog grew, which is the only reading of this chart that
 * changes a decision.
 */
export function monthlyFlow(tasks: Task[], today: Date = startOfToday(), months = 8): MonthlyFlow[] {
  const series: MonthlyFlow[] = [];
  const index = new Map<string, MonthlyFlow>();

  for (let back = months - 1; back >= 0; back--) {
    const date = new Date(today.getFullYear(), today.getMonth() - back, 1);
    const entry: MonthlyFlow = {
      year: date.getFullYear(),
      month: date.getMonth(),
      created: 0,
      stillOpen: 0,
      done: 0,
      cancelled: 0,
      closed: 0,
      current: back === 0,
    };
    series.push(entry);
    index.set(monthKey(date.getFullYear(), date.getMonth()), entry);
  }

  const monthOf = (date: Date | null): MonthlyFlow | undefined =>
    date ? index.get(monthKey(date.getFullYear(), date.getMonth())) : undefined;

  for (const task of commitments(tasks)) {
    const born = monthOf(originDate(task));
    if (born) {
      born.created++;
      if (task.open) born.stillOpen++;
    }

    if (task.open) continue;
    const entry = monthOf(closingDate(task));
    if (!entry) continue;
    if (isCancelled(task)) entry.cancelled++;
    else entry.done++;
    entry.closed++;
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
