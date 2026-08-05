import type { Task } from "../types/task";
import { DAY_LIMIT, dayKey } from "../query/Focus";
import { formatIsoDate, startOfToday } from "../index/dates";

export interface DayPlan {
  /** `YYYY-MM-DD` the plan was made for. */
  date: string;
  keys: string[];
}

export const EMPTY_PLAN: DayPlan = { date: "", keys: [] };

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
    this.plan = forToday(stored, today);
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
    this.plan = { date: formatIsoDate(today), keys: [...this.plan.keys, key] };
    this.persist(this.plan);
    return true;
  }

  remove(task: Task): void {
    const key = dayKey(task);
    if (!this.plan.keys.includes(key)) return;
    this.plan = { ...this.plan, keys: this.plan.keys.filter((k) => k !== key) };
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
   * Forgets keys whose task no longer exists — completed, deleted, or reworded. Without this a
   * finished task would keep one of the three slots for the rest of the day.
   */
  prune(tasks: Task[]): void {
    if (this.plan.keys.length === 0) return;
    const alive = new Set(tasks.filter((task) => task.open).map(dayKey));
    const kept = this.plan.keys.filter((key) => alive.has(key));
    if (kept.length === this.plan.keys.length) return;
    this.plan = { ...this.plan, keys: kept };
    this.persist(this.plan);
  }
}

function forToday(plan: DayPlan, today: Date): DayPlan {
  if (plan.keys.length === 0) return plan;
  return plan.date === formatIsoDate(today) ? plan : EMPTY_PLAN;
}
