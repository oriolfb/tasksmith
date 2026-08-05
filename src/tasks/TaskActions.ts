import { Notice } from "obsidian";
import type { ParsedTask, Priority, Task } from "../types/task";
import { removeField, setDateField, setPriority, setStatus } from "../index/TaskLineEditor";
import { parseTaskLine } from "../index/TaskParser";
import { addDays, startOfToday } from "../index/dates";
import type { TasksInterop } from "./TasksPluginSettings";
import { statusTypeOf } from "./TasksPluginSettings";
import type { TaskWriter, UndoResult, WriteResult } from "./TaskWriter";
import { undoableNotice } from "../views/UndoNotice";

/**
 * Quick actions used by both views. Every one goes through TaskWriter, so a stale row can
 * never overwrite a newer line.
 */
export class TaskActions {
  constructor(
    private readonly writer: TaskWriter,
    private interop: TasksInterop
  ) {}

  setInterop(interop: TasksInterop): void {
    this.interop = interop;
  }

  /** Groups every write until `endGroup` into a single undo step. Used by bulk actions. */
  beginGroup(label: string): void {
    this.writer.history.begin(label);
  }

  endGroup(): void {
    this.writer.history.commit();
  }

  undo(): Promise<UndoResult> {
    return this.writer.undo();
  }

  undoLabel(): string | null {
    return this.writer.history.peekLabel();
  }

  /** True when completing must be left to the Tasks plugin so the next instance is created. */
  isRecurring(task: Task): boolean {
    return task.fields.recurrence !== undefined;
  }

  async scheduleOn(task: Task, date: Date): Promise<WriteResult> {
    return this.apply(task, (parsed) => setDateField(parsed, "due", date), "Canviar la data");
  }

  async today(task: Task): Promise<WriteResult> {
    return this.scheduleOn(task, startOfToday());
  }

  async tomorrow(task: Task): Promise<WriteResult> {
    return this.scheduleOn(task, addDays(startOfToday(), 1));
  }

  async nextWeek(task: Task): Promise<WriteResult> {
    return this.scheduleOn(task, addDays(startOfToday(), 7));
  }

  /** Moves relative to the task's own date, falling back to today when it has none. */
  async postpone(task: Task, days: number): Promise<WriteResult> {
    const base = task.fields.due?.date ?? task.effectiveDate ?? startOfToday();
    return this.scheduleOn(task, addDays(base, days));
  }

  async clearDue(task: Task): Promise<WriteResult> {
    return this.apply(task, (parsed) => removeField(parsed, "due"), "Treure la data");
  }

  async setPriority(task: Task, priority: Priority | null): Promise<WriteResult> {
    return this.apply(
      task,
      (parsed) => (priority === null ? removeField(parsed, "priority") : setPriority(parsed, priority)),
      "Canviar la prioritat"
    );
  }

  async complete(task: Task): Promise<WriteResult | null> {
    if (this.isRecurring(task)) {
      new Notice(
        "Tasca recurrent: completa-la des de la nota perquè el plugin Tasks generi la següent repetició."
      );
      return null;
    }
    return this.apply(
      task,
      (parsed) => {
        let line = setStatus(parsed, "x");
        if (this.interop.setDoneDate) line = withDate(line, "done");
        return line;
      },
      "Completar"
    );
  }

  async cancel(task: Task): Promise<WriteResult> {
    const result = await this.apply(
      task,
      (parsed) => {
        let line = setStatus(parsed, "-");
        if (this.interop.setCancelledDate) line = withDate(line, "cancelled");
        return line;
      },
      "Cancel·lar"
    );
    if (result.ok) undoableNotice("Cancel·lada", this.writer);
    return result;
  }

  /** Removes the whole line. Reversible through the history for the next fifty writes. */
  async remove(task: Task): Promise<WriteResult> {
    const result = await this.writer.deleteLine(task, "Eliminar la tasca");
    if (result.ok) {
      undoableNotice(`Eliminada: ${task.description || "(sense descripció)"}`, this.writer);
    } else if (result.reason === "conflict") {
      new Notice("La línia ha canviat mentre la miraves; no s'ha eliminat res.");
    }
    return result;
  }

  async removeMany(tasks: Task[]): Promise<{ deleted: number; skipped: number }> {
    const label = tasks.length === 1 ? "Eliminar la tasca" : `Eliminar ${tasks.length} tasques`;
    return this.writer.deleteMany(tasks, label);
  }

  async reopen(task: Task): Promise<WriteResult> {
    return this.apply(
      task,
      (parsed) => {
        let line = setStatus(parsed, " ");
        const reparsed = parseTaskLine(line);
        if (reparsed?.fields.done) line = removeField(reparsed, "done");
        const again = parseTaskLine(line);
        if (again?.fields.cancelled) line = removeField(again, "cancelled");
        return line;
      },
      "Reobrir"
    );
  }

  /** Follows the status cycle the user configured in the Tasks plugin. */
  async cycleStatus(task: Task): Promise<WriteResult | null> {
    const next = this.interop.statuses.get(task.status)?.nextStatusSymbol ?? "x";
    const nextType = statusTypeOf(this.interop, next);
    if (nextType === "DONE") return this.complete(task);
    if (nextType === "CANCELLED") return this.cancel(task);
    if (nextType === "TODO" && !task.open) return this.reopen(task);
    return this.apply(task, (parsed) => setStatus(parsed, next), "Canviar l'estat");
  }

  private async apply(
    task: Task,
    edit: (parsed: ParsedTask) => string,
    label: string
  ): Promise<WriteResult> {
    const result = await this.writer.edit(task, edit, label);
    if (!result.ok && result.reason === "conflict") {
      new Notice("La línia ha canviat mentre la miraves. S'ha refet l'índex; torna-ho a provar.");
    }
    return result;
  }
}

function withDate(line: string, key: "done" | "cancelled"): string {
  const parsed = parseTaskLine(line);
  if (!parsed) return line;
  return setDateField(parsed, key, startOfToday());
}
