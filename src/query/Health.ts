import type { Task } from "../types/task";
import { ageInDays, bucketOf } from "../index/Buckets";
import { isEmptyTask } from "../index/EmptyTasks";
import { startOfToday } from "../index/dates";
import { NO_PROJECT, type QueryState } from "./Query";
import { closingState, commitments, datableFromNote, monthsBetween } from "./Metrics";
import { getLocale, t, tn } from "../i18n/strings";

/**
 * The health panel: not statistics, but a short list of concrete things to fix, each with the
 * one action that fixes it. Pure, so the audit can assert the rules on the real vault.
 *
 * The one action a finding offers always points the table at the offending tasks (`filter`).
 * Nothing here writes anything, and nothing here decides on the user's behalf what to do with
 * what it finds — that stays a task-by-task call, made at the table.
 */
export interface Finding {
  key: string;
  /** `warn` is something to fix; `ok` is the system doing its job, and reads quieter. */
  tone: "warn" | "ok";
  title: string;
  detail: string;
  /** Label of the single action, when there is one. */
  action?: string;
  /** Where the action sends the table. */
  filter?: Partial<QueryState>;
}

export interface HealthContext {
  today?: Date;
  staleThresholdDays: number;
  mtimeOf?: (path: string) => number | null;
  /** Notes and task lines scanned, for the "index is clean" line. Omitted where unknown. */
  notes?: number;
  lines?: number;
  /** Whether the plugin is allowed to delete `- [ ]` leftovers by itself. */
  autoDeleteEmptyTasks?: boolean;
}

export function healthFindings(tasks: Task[], ctx: HealthContext): Finding[] {
  const today = ctx.today ?? startOfToday();
  const mtimeOf = ctx.mtimeOf ?? (() => null);
  const findings: Finding[] = [];

  const closings = closingState(tasks, today);
  const open = commitments(tasks).filter((task) => task.open);
  const renegotiable = open.filter((task) => bucketOf(task, today) === "overdue");

  /*
   * The most uncomfortable finding of the whole exercise, and the reason the overdue list grew
   * for five weeks: closing a task has only ever meant finishing it. "No ho faré" is a decision
   * too, and it had never once been used.
   *
   * Gated on there being overdue tasks right now: the action is "renegotiate them", and a finding
   * whose one action opens an empty table is noise, not a thing to fix.
   */
  if (renegotiable.length > 0 && closings.done > 0 && closings.cancelled === 0) {
    const span = closings.first ? monthsBetween(closings.first, today) : 0;
    findings.push({
      key: "no-cancellations",
      tone: "warn",
      title: span > 0 ? tn("health.noCancellations.title.withSpan", span) : t("health.noCancellations.title.noSpan"),
      detail: t("health.noCancellations.detail", { closed: closings.closed, done: closings.done }),
      action: t("health.renegotiateAction"),
      filter: { statusScope: "open", buckets: ["overdue"], sort: "age", sortReverse: false },
    });
  } else if (
    renegotiable.length > 0 &&
    closings.cancelled > 0 &&
    closings.cancelled / Math.max(1, closings.closed) < 0.03
  ) {
    const percent = ((closings.cancelled / closings.closed) * 100)
      .toFixed(1)
      .replace(".", getLocale() === "en" ? "." : ",");
    findings.push({
      key: "few-cancellations",
      tone: "warn",
      title: t("health.fewCancellations.title", { cancelled: closings.cancelled, closed: closings.closed }),
      detail: t("health.fewCancellations.detail", { percent }),
      action: t("health.renegotiateAction"),
      filter: { statusScope: "open", buckets: ["overdue"], sort: "age", sortReverse: false },
    });
  }

  /*
   * Tasks whose note records a `data:` that is deliberately not a deadline (a meeting's date is
   * not its tasks' deadline) — but each one is a candidate for a date the user would type anyway.
   * The panel only points at them; which get that date, and which don't, is a per-task call made
   * at the table, not a batch write from here.
   */
  const datable = datableFromNote(tasks, today);
  if (datable.length > 0) {
    findings.push({
      key: "undated-with-note-date",
      tone: "warn",
      title: t("health.undatedWithNoteDate.title", { count: datable.length }),
      detail: t("health.undatedWithNoteDate.detail"),
      action: t("health.viewThemAction"),
      filter: { statusScope: "open", buckets: ["undated"], noteDatableOnly: true, sort: "age", sortReverse: false },
    });
  }

  /*
   * `Projecte:` is the frontmatter key the plugin insisted on and the one that is usually empty.
   * The plugin does not write frontmatter — every write it makes is one guarded, undoable line —
   * so the action shows you the notes and you fill it in there.
   */
  const withoutProject = new Set(
    open.filter((task) => (task.project ?? NO_PROJECT) === NO_PROJECT).map((task) => task.location.path)
  );
  if (withoutProject.size > 0) {
    findings.push({
      key: "notes-without-project",
      tone: "warn",
      title: t("health.notesWithoutProject.title", { count: withoutProject.size }),
      detail: t("health.notesWithoutProject.detail"),
      action: t("health.viewThemAction"),
      filter: { statusScope: "open", project: NO_PROJECT, buckets: null },
    });
  }

  const stale = open.filter((task) => {
    const age = ageInDays(task, mtimeOf(task.location.path), today);
    return age !== null && age >= ctx.staleThresholdDays;
  });
  if (stale.length > 0) {
    const oldest = Math.max(
      ...stale.map((task) => ageInDays(task, mtimeOf(task.location.path), today) ?? 0)
    );
    findings.push({
      key: "stale",
      tone: "warn",
      title: t("health.stale.title", { count: stale.length, days: ctx.staleThresholdDays }),
      detail: t("health.stale.detail", { oldest }),
      action: t("health.staleAction"),
      filter: { statusScope: "open", staleOnly: true, buckets: null, sort: "age", sortReverse: false },
    });
  }

  const empty = tasks.filter(isEmptyTask);
  if (empty.length > 0) {
    findings.push({
      key: "empty-tasks",
      tone: "warn",
      title: tn("health.emptyTasks.title", empty.length),
      detail: ctx.autoDeleteEmptyTasks
        ? t("health.emptyTasks.detail.auto")
        : t("health.emptyTasks.detail.manual"),
    });
  }

  const reference = tasks.filter((task) => task.open && !isEmptyTask(task) && task.kind === "reference");
  if (reference.length > 0) {
    findings.push({
      key: "reference-lines",
      tone: "ok",
      title: t("health.referenceLines.title", { count: reference.length }),
      detail: t("health.referenceLines.detail"),
      action: t("health.showThemAction"),
      filter: { statusScope: "open", includeReference: true, buckets: null },
    });
  }

  if (ctx.notes !== undefined && ctx.lines !== undefined) {
    findings.push({
      key: "index",
      tone: "ok",
      title: t("health.index.title"),
      detail: t("health.index.detail", {
        notes: ctx.notes,
        lines: ctx.lines,
        open: open.length,
        renegotiate: renegotiable.length,
        empty: empty.length,
      }),
    });
  }

  return findings;
}
