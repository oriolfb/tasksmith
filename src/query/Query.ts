import type { Bucket, Priority, Task } from "../types/task";
import { BUCKET_ORDER, ageInDays, bucketOf } from "../index/Buckets";
import { isEmptyTask } from "../index/EmptyTasks";
import { formatIsoDate, startOfToday } from "../index/dates";

export type SortKey = "date" | "priority" | "age" | "note" | "text" | "person" | "area";
export type GroupKey = "bucket" | "person" | "project" | "area" | "note" | "none";
export type StatusScope = "open" | "closed" | "all";

export interface QueryState {
  text: string;
  statusScope: StatusScope;
  buckets: Bucket[] | null;
  /**
   * Named days, `YYYY-MM-DD`, as the week strip hands them over. Narrower than a bucket and not
   * expressible as one: "dijous" is neither "avui" nor "aquesta setmana". A list rather than a
   * day because one column can stand for more than one date — a Monday carrying a hidden
   * weekend — and a count you can click has to open exactly what it counted.
   */
  dueOn: string[] | null;
  project: string | null;
  area: string | null;
  /** One of the note's `Persones:`, for the "who with" lens. */
  person: string | null;
  priority: Priority | null;
  staleOnly: boolean;
  /** Documentation checklists. Off by default, never hidden without saying so. */
  includeReference: boolean;
  /** Someday/maybe lines from `tipus: idea` notes and friends. */
  includeSomeday: boolean;
  sort: SortKey;
  /** Clicking the active column again turns the order around. Tiebreakers stay ascending. */
  sortReverse: boolean;
  group: GroupKey;
}

export const DEFAULT_QUERY: QueryState = {
  text: "",
  statusScope: "open",
  buckets: null,
  dueOn: null,
  project: null,
  area: null,
  person: null,
  priority: null,
  staleOnly: false,
  includeReference: false,
  includeSomeday: false,
  sort: "date",
  sortReverse: false,
  group: "bucket",
};

export interface TaskGroup {
  key: string;
  label: string;
  tasks: Task[];
}

const PRIORITY_RANK: Record<Priority, number> = {
  highest: 0,
  high: 1,
  medium: 2,
  low: 3,
  lowest: 4,
};

const BUCKET_LABELS: Record<Bucket, string> = {
  overdue: "Endarrerides",
  today: "Avui",
  week: "Aquesta setmana",
  later: "Més endavant",
  undated: "Sense data",
  closed: "Tancades",
};

export const NO_PROJECT = "Sense projecte";
export const NO_PERSON = "Sense persona";

/** The people a task can be discussed with, or the catch-all bucket when the note names none. */
export function peopleOf(task: Task): string[] {
  return task.people.length > 0 ? task.people : [NO_PERSON];
}

/**
 * Counts per person for the "who with" lens. A task in a note naming two people appears under
 * both, so these counts add up to more than the number of tasks — by design, and the view says so.
 */
export function countByPerson(tasks: Task[], state: QueryState, ctx: QueryContext): Map<string, number> {
  const counts = new Map<string, number>();
  for (const task of filterTasks(tasks, { ...state, person: null }, ctx)) {
    for (const person of peopleOf(task)) counts.set(person, (counts.get(person) ?? 0) + 1);
  }
  return counts;
}

export function bucketLabel(bucket: Bucket): string {
  return BUCKET_LABELS[bucket];
}

export interface QueryContext {
  today: Date;
  mtimeOf: (path: string) => number | null;
  staleThresholdDays: number;
}

export function filterTasks(tasks: Task[], state: QueryState, ctx: QueryContext): Task[] {
  const needle = state.text.trim().toLowerCase();
  return tasks.filter((task) => {
    // Placeholders carry no information and are never actionable, so no view shows them.
    if (isEmptyTask(task)) return false;
    if (task.kind === "reference" && !state.includeReference) return false;
    if (task.kind === "someday" && !state.includeSomeday) return false;
    if (state.statusScope === "open" && !task.open) return false;
    if (state.statusScope === "closed" && task.open) return false;
    if (state.buckets && !state.buckets.includes(bucketOf(task, ctx.today))) return false;
    if (state.dueOn !== null && (!task.effectiveDate || !state.dueOn.includes(formatIsoDate(task.effectiveDate)))) {
      return false;
    }
    if (state.project !== null && (task.project ?? NO_PROJECT) !== state.project) return false;
    if (state.area !== null && (task.area ?? "") !== state.area) return false;
    if (state.person !== null && !peopleOf(task).includes(state.person)) return false;
    if (state.priority !== null && task.priority !== state.priority) return false;
    if (state.staleOnly) {
      const age = ageInDays(task, ctx.mtimeOf(task.location.path), ctx.today);
      if (age === null || age < ctx.staleThresholdDays) return false;
    }
    if (needle) {
      const haystack = `${task.description} ${task.location.path}`.toLowerCase();
      if (!haystack.includes(needle)) return false;
    }
    return true;
  });
}

/**
 * `reverse` flips the chosen column only: path and line stay ascending, so two rows that
 * compare equal keep the order they have in the note whichever way the column points.
 */
export function sortTasks(tasks: Task[], key: SortKey, ctx: QueryContext, reverse = false): Task[] {
  const direction = reverse ? -1 : 1;
  const sorted = [...tasks];
  sorted.sort(
    (a, b) =>
      compare(a, b, key, ctx) * direction ||
      a.location.path.localeCompare(b.location.path) ||
      a.location.line - b.location.line
  );
  return sorted;
}

export function groupTasks(
  tasks: Task[],
  key: GroupKey,
  ctx: QueryContext,
  /** When set, the "person" grouping shows only this person's group, not every co-named person. */
  restrictPerson: string | null = null
): TaskGroup[] {
  if (key === "none") return tasks.length ? [{ key: "all", label: "Totes", tasks }] : [];

  if (key === "person" && restrictPerson !== null) {
    return tasks.length ? [{ key: restrictPerson, label: restrictPerson, tasks }] : [];
  }

  // A task can sit under several people at once, so this grouping is not a partition.
  // Ordered by size: the person you owe the most to comes first, "Sense persona" always last.
  if (key === "person") {
    const groups = new Map<string, TaskGroup>();
    for (const task of tasks) {
      for (const person of peopleOf(task)) {
        const existing = groups.get(person);
        if (existing) existing.tasks.push(task);
        else groups.set(person, { key: person, label: person, tasks: [task] });
      }
    }
    return [...groups.values()].sort((a, b) => {
      if ((a.key === NO_PERSON) !== (b.key === NO_PERSON)) return a.key === NO_PERSON ? 1 : -1;
      return b.tasks.length - a.tasks.length || a.label.localeCompare(b.label);
    });
  }

  const groups = new Map<string, TaskGroup>();
  for (const task of tasks) {
    const { key: groupKey, label } = groupOf(task, key, ctx);
    const existing = groups.get(groupKey);
    if (existing) existing.tasks.push(task);
    else groups.set(groupKey, { key: groupKey, label, tasks: [task] });
  }

  const ordered = [...groups.values()];
  if (key === "bucket") {
    ordered.sort((a, b) => BUCKET_ORDER.indexOf(a.key as Bucket) - BUCKET_ORDER.indexOf(b.key as Bucket));
  } else {
    ordered.sort((a, b) => a.label.localeCompare(b.label));
  }
  return ordered;
}

export function runQuery(tasks: Task[], state: QueryState, ctx: QueryContext): TaskGroup[] {
  const sorted = sortTasks(filterTasks(tasks, state, ctx), state.sort, ctx, state.sortReverse);
  return groupTasks(sorted, state.group, ctx, state.person);
}

/**
 * Counts of what you are actually on the hook for. Documentation checklists and someday lines
 * are excluded: a count you have learnt to distrust is worse than no count.
 */
export function bucketCounts(tasks: Task[], today = startOfToday()): Record<Bucket, number> {
  const counts: Record<Bucket, number> = { overdue: 0, today: 0, week: 0, later: 0, undated: 0, closed: 0 };
  for (const task of tasks) {
    if (isEmptyTask(task) || task.kind !== "commitment") continue;
    counts[bucketOf(task, today)]++;
  }
  return counts;
}

/** How many lines each non-commitment kind holds, for the "21 lines classified as reference" note. */
export function countByKind(tasks: Task[]): { reference: number; someday: number } {
  let reference = 0;
  let someday = 0;
  for (const task of tasks) {
    if (isEmptyTask(task) || !task.open) continue;
    if (task.kind === "reference") reference++;
    else if (task.kind === "someday") someday++;
  }
  return { reference, someday };
}

function compare(a: Task, b: Task, key: SortKey, ctx: QueryContext): number {
  switch (key) {
    case "date": {
      // Undated tasks sort last: they are triage material, not schedule material.
      const at = a.effectiveDate?.getTime() ?? Number.POSITIVE_INFINITY;
      const bt = b.effectiveDate?.getTime() ?? Number.POSITIVE_INFINITY;
      return at - bt;
    }
    case "priority": {
      const ar = a.priority ? PRIORITY_RANK[a.priority] : 99;
      const br = b.priority ? PRIORITY_RANK[b.priority] : 99;
      return ar - br;
    }
    case "age": {
      const aa = ageInDays(a, ctx.mtimeOf(a.location.path), ctx.today) ?? -1;
      const ba = ageInDays(b, ctx.mtimeOf(b.location.path), ctx.today) ?? -1;
      return ba - aa;
    }
    case "note":
      return a.location.path.localeCompare(b.location.path);
    case "text":
      return a.description.localeCompare(b.description);
    // The columns the control centre's table sorts by. A row with nothing in the column goes
    // last either way round, because "—" is not a value you asked to sort by.
    case "person":
      return blankLast(a.people[0] ?? "", b.people[0] ?? "");
    case "area":
      return blankLast(a.area ?? "", b.area ?? "");
  }
}

function blankLast(a: string, b: string): number {
  if (!a !== !b) return a ? -1 : 1;
  return a.localeCompare(b);
}

function groupOf(task: Task, key: GroupKey, ctx: QueryContext): { key: string; label: string } {
  switch (key) {
    case "bucket": {
      const bucket = bucketOf(task, ctx.today);
      return { key: bucket, label: bucketLabel(bucket) };
    }
    case "person": {
      // Handled in `groupTasks`, which fans a task out to every person named in its note.
      const person = peopleOf(task)[0] ?? NO_PERSON;
      return { key: person, label: person };
    }
    case "project": {
      const project = task.project ?? NO_PROJECT;
      return { key: project, label: project };
    }
    case "area": {
      const area = task.area ?? "Sense àrea";
      return { key: area, label: area };
    }
    case "note": {
      const name = task.location.path.replace(/\.md$/, "").split("/").pop() ?? task.location.path;
      return { key: task.location.path, label: name };
    }
    case "none":
      return { key: "all", label: "Totes" };
  }
}
