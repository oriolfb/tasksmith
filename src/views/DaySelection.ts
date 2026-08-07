import type { Task } from "../types/task";
import { DAY_LIMIT, dayKey } from "../query/Focus";
import { formatIsoDate, startOfToday } from "../index/dates";

export interface DayPlan {
  /** `YYYY-MM-DD` the plan was made for. */
  date: string;
  keys: string[];
  /**
   * Keys ticked off today, in the order they fell. They keep their place in "Avui", struck
   * through, and they do **not** hold a slot: finishing one of the three frees it, but the line
   * stays. A day where you closed two and picked a third should not look like a day that never
   * started.
   */
  done: string[];
  /**
   * Every key that has held one of today's three slots at some point, in pick order — including
   * keys since finished and removed from `keys`. `keys` alone forgets a task the moment it frees
   * its slot, which is right for counting what is still free, but wrong for numbering: a finished
   * task's row would lose its ordinal and read as having moved, when it should just sit there
   * struck through.
   */
  slotted: string[];
}

export const EMPTY_PLAN: DayPlan = { date: "", keys: [], done: [], slotted: [] };

/**
 * Today's chosen three.
 *
 * Kept in the plugin's own data, **not written to the notes**, and stamped with the day it was
 * made for. That is what makes the day cost nothing: at midnight the stamp no longer matches
 * and the plan is gone, so an unfinished task returns to the pool instead of turning into an
 * overdue one. Writing `📅 avui` to the markdown would have created exactly the debt that left
 * twenty tasks rotting for up to five weeks.
 */
export class DaySelection {
  private plan: DayPlan;

  constructor(
    stored: DayPlan,
    private readonly persist: (plan: DayPlan) => void,
    today: Date = startOfToday()
  ) {
    this.plan = forToday(withSlotted(withDone(stored)), today);
  }

  /** Drops the plan if it was made for another day. Call before reading on a fresh paint. */
  refresh(today: Date = startOfToday()): void {
    const next = forToday(this.plan, today);
    if (next !== this.plan) {
      this.plan = next;
      this.persist(this.plan);
    }
  }

  keys(): string[] {
    return this.plan.keys;
  }

  doneKeys(): string[] {
    return this.plan.done;
  }

  slottedKeys(): string[] {
    return this.plan.slotted;
  }

  has(task: Task): boolean {
    return this.plan.keys.includes(dayKey(task));
  }

  get size(): number {
    return this.plan.keys.length;
  }

  get isFull(): boolean {
    return this.plan.keys.length >= DAY_LIMIT;
  }

  /** Adds a task to the day. Returns false when the three slots are taken. */
  add(task: Task, today: Date = startOfToday()): boolean {
    const key = dayKey(task);
    if (this.plan.keys.includes(key)) return true;
    if (this.isFull) return false;
    const slotted = this.plan.slotted.includes(key) ? this.plan.slotted : [...this.plan.slotted, key];
    this.plan = { ...this.plan, date: formatIsoDate(today), keys: [...this.plan.keys, key], slotted };
    this.persist(this.plan);
    return true;
  }

  /** Drops a task from the day entirely — unlike finishing it, this forgets it held a slot at all. */
  remove(task: Task): void {
    const key = dayKey(task);
    if (!this.plan.keys.includes(key) && !this.plan.done.includes(key)) return;
    this.plan = {
      ...this.plan,
      keys: this.plan.keys.filter((k) => k !== key),
      done: this.plan.done.filter((k) => k !== key),
      slotted: this.plan.slotted.filter((k) => k !== key),
    };
    this.persist(this.plan);
  }

  /**
   * Records a task as finished today. Called for every row in "Avui" — including the urgent ones,
   * which never held a slot — so that ticking one leaves a struck line instead of a gap.
   *
   * Stamps the plan with today, because an urgent task can be the first thing you close on a day
   * where you have not picked anything yet, and an undated plan is wiped on the next paint.
   */
  markDone(task: Task, today: Date = startOfToday()): void {
    const key = dayKey(task);
    const keys = this.plan.keys.filter((k) => k !== key);
    const already = this.plan.done.includes(key);
    if (already && keys.length === this.plan.keys.length) return;
    this.plan = {
      ...this.plan,
      date: formatIsoDate(today),
      keys,
      done: already ? this.plan.done : [...this.plan.done, key],
    };
    this.persist(this.plan);
  }

  /**
   * Un-ticks a task: it leaves the day's record and takes a free slot back if there is one.
   * Reopening one of your three should hand it back, not send it to the bottom of the pool.
   */
  reopened(task: Task, today: Date = startOfToday()): void {
    const key = dayKey(task);
    if (!this.plan.done.includes(key)) return;
    const room = !this.plan.keys.includes(key) && this.plan.keys.length < DAY_LIMIT;
    this.plan = {
      ...this.plan,
      date: formatIsoDate(today),
      keys: room ? [...this.plan.keys, key] : this.plan.keys,
      done: this.plan.done.filter((k) => k !== key),
    };
    this.persist(this.plan);
  }

  toggle(task: Task, today: Date = startOfToday()): boolean {
    if (this.has(task)) {
      this.remove(task);
      return true;
    }
    return this.add(task, today);
  }

  /**
   * Reconciles the plan with the index. A slot is freed the moment its task stops being open —
   * otherwise a finished task would hold one for the rest of the day — but a task that was ticked
   * off moves to the day's record instead of vanishing, whether you ticked it here or in the note.
   * Keys whose task no longer exists at all (deleted, or reworded) are simply forgotten.
   */
  prune(tasks: Task[]): void {
    if (this.plan.keys.length === 0 && this.plan.done.length === 0) return;
    /*
     * Nothing to reconcile against, so nothing is reconciled. An index that has not finished its
     * first scan looks exactly like a vault with no tasks in it, and pruning against that wiped
     * the day's plan on every Obsidian start — the slower the scan, the surer the loss. The
     * caller also waits for `index.ready`; this is the guard that does not depend on remembering to.
     */
    if (tasks.length === 0) return;

    const open = new Set<string>();
    const exists = new Set<string>();
    for (const task of tasks) {
      const key = dayKey(task);
      exists.add(key);
      if (task.open) open.add(key);
    }

    const keys = this.plan.keys.filter((key) => open.has(key));
    const done = this.plan.done.filter((key) => exists.has(key));
    for (const key of this.plan.keys) {
      if (!open.has(key) && exists.has(key) && !done.includes(key)) done.push(key);
    }
    const slotted = this.plan.slotted.filter((key) => exists.has(key));

    if (
      keys.length === this.plan.keys.length &&
      same(done, this.plan.done) &&
      same(slotted, this.plan.slotted)
    ) {
      return;
    }
    this.plan = { ...this.plan, keys, done, slotted };
    this.persist(this.plan);
  }
}

/** Data written by 0.2.2 has no record of what was done. */
function withDone(plan: DayPlan): DayPlan {
  return plan.done ? plan : { ...plan, done: [] };
}

/**
 * Data written before this ordinal was tracked separately has no `slotted` at all. `keys` is the
 * best available guess — it undercounts a plan with tasks already finished when the plugin
 * updates, so those rows fall back to the foot list for one day rather than crashing.
 */
function withSlotted(plan: DayPlan): DayPlan {
  return plan.slotted ? plan : { ...plan, slotted: [...plan.keys] };
}

function forToday(plan: DayPlan, today: Date): DayPlan {
  if (plan.keys.length === 0 && plan.done.length === 0) return plan;
  return plan.date === formatIsoDate(today) ? plan : EMPTY_PLAN;
}

function same(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((value, i) => value === b[i]);
}
