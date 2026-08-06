import type { Task } from "../types/task";
import { ageInDays, bucketOf } from "../index/Buckets";
import { isEmptyTask } from "../index/EmptyTasks";
import { startOfToday } from "../index/dates";
import { NO_PROJECT, type QueryState } from "./Query";
import { closingState, commitments, datableFromNote, monthsBetween } from "./Metrics";

/**
 * The health panel: not statistics, but a short list of concrete things to fix, each with the
 * one action that fixes it. Pure, so the audit can assert the rules on the real vault.
 *
 * A finding either points the table at the offending tasks (`filter`) or names a fix the view
 * knows how to run (`fix`). Nothing here writes anything.
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
  /** A fix that writes, run by the view: it owns the actions and the undo notice. */
  fix?: "apply-note-date";
  /** The exact tasks the fix operates on. */
  tasks?: Task[];
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

  /*
   * The most uncomfortable finding of the whole exercise, and the reason the overdue list grew
   * for five weeks: closing a task has only ever meant finishing it. "No ho faré" is a decision
   * too, and it had never once been used.
   */
  if (closings.done > 0 && closings.cancelled === 0) {
    const span = closings.first ? monthsBetween(closings.first, today) : 0;
    findings.push({
      key: "no-cancellations",
      tone: "warn",
      title: span > 0 ? `Cap tasca cancel·lada en ${span} ${span === 1 ? "mes" : "mesos"}` : "Cap tasca cancel·lada",
      detail:
        `${closings.closed} tancades, ${closings.done} amb ✅ i cap amb ❌. Dir «no ho faré» és una ` +
        "decisió que encara no has pres mai — per això les endarrerides s'acumulen en lloc de tancar-se.",
      action: "Renegociar-les una a una →",
      filter: { statusScope: "open", buckets: ["overdue"], sort: "age", sortReverse: false },
    });
  } else if (closings.cancelled > 0 && closings.cancelled / Math.max(1, closings.closed) < 0.03) {
    const percent = ((closings.cancelled / closings.closed) * 100).toFixed(1).replace(".", ",");
    findings.push({
      key: "few-cancellations",
      tone: "warn",
      title: `Només ${closings.cancelled} de ${closings.closed} tancades s'han cancel·lat`,
      detail: `Un ${percent}%. Renegociar és una sortida tan vàlida com acabar-la, i gairebé no es fa servir.`,
      action: "Renegociar-les una a una →",
      filter: { statusScope: "open", buckets: ["overdue"], sort: "age", sortReverse: false },
    });
  }

  /*
   * Tasks the plugin could date with a single guarded write: their note records a `data:` that
   * is deliberately not a deadline (a meeting's date is not its tasks' deadline), but it is the
   * date the user would have typed anyway.
   */
  const datable = datableFromNote(tasks, today);
  if (datable.length > 0) {
    findings.push({
      key: "undated-with-note-date",
      tone: "warn",
      title: `${datable.length} sense data que la nota sí que té`,
      detail:
        "La nota porta una «data:» que el plugin no fa servir com a termini a propòsit — el dia " +
        "d'una reunió no és el termini de les seves tasques. Però és la data que hi posaries.",
      action: `Posar-hi la data de la nota →`,
      fix: "apply-note-date",
      tasks: datable,
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
      title: `${withoutProject.size} notes amb tasques obertes i sense «Projecte»`,
      detail:
        "Sense ell la lent «Per àrea» agrupa per carpeta i prou. S'omple al frontmatter de la nota: " +
        "el plugin no escriu mai fora de la línia de la tasca.",
      action: "Veure-les →",
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
      title: `${stale.length} apuntades fa més de ${ctx.staleThresholdDays} dies`,
      detail: `La més antiga fa ${oldest} dies. Amb data o sense: si segueix aquí, o es fa o es descarta.`,
      action: "Veure les aturades →",
      filter: { statusScope: "open", staleOnly: true, buckets: null, sort: "age", sortReverse: false },
    });
  }

  const empty = tasks.filter(isEmptyTask);
  if (empty.length > 0) {
    findings.push({
      key: "empty-tasks",
      tone: "warn",
      title: `${empty.length} ${empty.length === 1 ? "línia buida" : "línies buides"} de plantilla`,
      detail: ctx.autoDeleteEmptyTasks
        ? "Un «- [ ]» sense text, deixat per una plantilla. S'esborraran soles; cap vista les compta."
        : "Un «- [ ]» sense text, deixat per una plantilla. No es compten enlloc; l'ordre " +
          "«Eliminar les tasques buides ara» les treu, i es pot desfer.",
    });
  }

  const reference = tasks.filter((task) => task.open && !isEmptyTask(task) && task.kind === "reference");
  if (reference.length > 0) {
    findings.push({
      key: "reference-lines",
      tone: "ok",
      title: `${reference.length} línies de documentació fora dels comptadors`,
      detail:
        "Checklists de notes amb «tipus: documentacio». Es queden a la nota i no es compten mai " +
        "com a tasques obertes.",
      action: "Ensenya-me-les →",
      filter: { statusScope: "open", includeReference: true, buckets: null },
    });
  }

  const overdueUnpicked = open.filter((task) => bucketOf(task, today) === "overdue").length;
  if (ctx.notes !== undefined && ctx.lines !== undefined) {
    findings.push({
      key: "index",
      tone: "ok",
      title: "Índex",
      detail:
        `${ctx.notes} notes · ${ctx.lines} línies de tasca · ${open.length} obertes ` +
        `(${overdueUnpicked} per renegociar) · ${empty.length} buides.`,
    });
  }

  return findings;
}
