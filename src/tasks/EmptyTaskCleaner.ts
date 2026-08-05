import type { Task } from "../types/task";
import { isEmptyTask } from "../index/EmptyTasks";
import type { TaskWriter } from "./TaskWriter";
import { undoableNotice } from "../views/UndoNotice";
import { Logger } from "../utils/Logger";

export interface CleanerOptions {
  enabled: () => boolean;
  /** Vault-relative path of the note being edited right now, or null. */
  activePath: () => string | null;
}

/**
 * Deletes template leftovers like a bare `- [ ]`. The file currently open for editing is
 * never touched, so a placeholder being typed into survives until the user moves away.
 *
 * Off by default: it is the only thing here that writes to notes without being asked, and a
 * silent write to an iCloud-synced vault has to be opted into, not opted out of. When it does
 * run, the whole batch is one undo step.
 */
export class EmptyTaskCleaner {
  constructor(
    private readonly writer: TaskWriter,
    private readonly options: CleanerOptions
  ) {}

  /** Empty tasks eligible for deletion: everything except those in the active note. */
  candidates(tasks: Task[]): Task[] {
    const active = this.options.activePath();
    return tasks.filter((task) => isEmptyTask(task) && task.location.path !== active);
  }

  async clean(tasks: Task[]): Promise<number> {
    if (!this.options.enabled()) return 0;

    const targets = this.candidates(tasks);
    if (targets.length === 0) return 0;

    const label = deleteLabel(targets.length);
    const { deleted, skipped } = await this.writer.deleteMany(targets, label);
    if (deleted > 0) {
      Logger.info(`removed ${deleted} empty task line(s)`);
      undoableNotice(
        deleted === 1 ? "S'ha eliminat 1 tasca buida" : `S'han eliminat ${deleted} tasques buides`,
        this.writer
      );
    }
    if (skipped > 0) Logger.warn(`${skipped} empty task line(s) left in place`);
    return deleted;
  }

  /** Cleans only the given note, used when a file stops being the active one. */
  async cleanPath(tasks: Task[], path: string): Promise<number> {
    return this.clean(tasks.filter((task) => task.location.path === path));
  }
}

function deleteLabel(count: number): string {
  return count === 1 ? "Eliminar 1 tasca buida" : `Eliminar ${count} tasques buides`;
}
