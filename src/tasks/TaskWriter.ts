import { type App, TFile } from "obsidian";
import type { ParsedTask, Task } from "../types/task";
import { parseTaskLine } from "../index/TaskParser";
import { Logger } from "../utils/Logger";
import { History, type WriteRecord } from "./History";

export type WriteResult =
  | { ok: true; line: string }
  | { ok: false; reason: "missing-file" | "missing-line" | "conflict" | "unparsable" };

export type UndoResult =
  | { ok: true; label: string; restored: number; skipped: number }
  | { ok: false; reason: "empty" };

/**
 * Writes exactly one line. The line the index believes in is compared against what is on
 * disk first; if they differ (an edit in the editor, or an iCloud sync landing mid-flight)
 * the write is abandoned rather than clobbering the newer text.
 *
 * Every successful write is recorded in `history`, which is what makes `undo` possible: the
 * conflict guard already had to know the previous text, so keeping it costs nothing.
 */
export class TaskWriter {
  constructor(
    private readonly app: App,
    readonly history: History = new History()
  ) {}

  /** Removes the task's whole line, including its newline. Same conflict guard as `edit`. */
  async deleteLine(task: Task, label = "Eliminar la tasca"): Promise<WriteResult> {
    const { deleted, skipped } = await this.deleteMany([task], label);
    if (deleted === 1) return { ok: true, line: "" };
    return { ok: false, reason: skipped > 0 ? "conflict" : "missing-file" };
  }

  /**
   * Deletes many task lines. Grouped by file and applied bottom-up inside a single
   * `vault.process` per file: deleting top-down would shift the line numbers of every
   * task still queued for that file.
   */
  async deleteMany(tasks: Task[], label = "Eliminar tasques"): Promise<{ deleted: number; skipped: number }> {
    const byPath = new Map<string, Task[]>();
    for (const task of tasks) {
      const list = byPath.get(task.location.path);
      if (list) list.push(task);
      else byPath.set(task.location.path, [task]);
    }

    let deleted = 0;
    let skipped = 0;
    const records: WriteRecord[] = [];

    for (const [path, group] of byPath) {
      const file = this.app.vault.getAbstractFileByPath(path);
      if (!(file instanceof TFile)) {
        skipped += group.length;
        Logger.warn(`delete skipped (missing-file) at ${path}`);
        continue;
      }

      const ordered = [...group].sort((a, b) => b.location.line - a.location.line);

      await this.app.vault.process(file, (content) => {
        const lines = content.split("\n");
        for (const task of ordered) {
          const current = lines[task.location.line];
          if (current === undefined) {
            skipped++;
            Logger.warn(`delete skipped (missing-line) at ${path}:${task.location.line}`);
            continue;
          }
          const bare = current.endsWith("\r") ? current.slice(0, -1) : current;
          if (bare !== task.raw) {
            skipped++;
            Logger.warn(`delete skipped (conflict) at ${path}:${task.location.line}`);
            continue;
          }
          const anchorBefore = bareLine(lines[task.location.line - 1]) ?? null;
          const anchorAfter = bareLine(lines[task.location.line + 1]) ?? null;
          lines.splice(task.location.line, 1);
          records.push({
            path,
            line: task.location.line,
            before: task.raw,
            after: null,
            anchorBefore,
            anchorAfter,
          });
          deleted++;
        }
        return lines.join("\n");
      });
    }

    this.history.record(label, records);
    return { deleted, skipped };
  }

  async edit(task: Task, edit: (parsed: ParsedTask) => string, label = "Editar la tasca"): Promise<WriteResult> {
    const file = this.app.vault.getAbstractFileByPath(task.location.path);
    if (!(file instanceof TFile)) return { ok: false, reason: "missing-file" };

    let result: WriteResult = { ok: false, reason: "missing-line" };

    await this.app.vault.process(file, (content) => {
      const lines = content.split("\n");
      const current = lines[task.location.line];
      if (current === undefined) {
        result = { ok: false, reason: "missing-line" };
        return content;
      }

      const eol = current.endsWith("\r") ? "\r" : "";
      const bare = eol ? current.slice(0, -1) : current;

      if (bare !== task.raw) {
        result = { ok: false, reason: "conflict" };
        return content;
      }

      const parsed = parseTaskLine(bare);
      if (!parsed) {
        result = { ok: false, reason: "unparsable" };
        return content;
      }

      const next = edit(parsed);
      if (next === bare) {
        result = { ok: true, line: next };
        return content;
      }

      lines[task.location.line] = next + eol;
      result = { ok: true, line: next };
      this.history.record(label, [
        { path: task.location.path, line: task.location.line, before: bare, after: next },
      ]);
      return lines.join("\n");
    });

    if (!result.ok) Logger.warn(`write skipped (${result.reason}) at ${task.location.path}:${task.location.line}`);
    return result;
  }

  /**
   * Reverts the newest history entry.
   *
   * Records inside an entry all reference line numbers from one index snapshot, so replaying
   * them **ascending** rebuilds the original numbering as it goes: re-inserting line 3 puts
   * line 7 back where its record says it was. Each record keeps the same conflict guard as a
   * forward write — a line someone has since touched is left alone and counted as skipped.
   */
  async undo(): Promise<UndoResult> {
    const entry = this.history.pop();
    if (!entry) return { ok: false, reason: "empty" };

    const byPath = new Map<string, WriteRecord[]>();
    for (const record of entry.records) {
      const list = byPath.get(record.path);
      if (list) list.push(record);
      else byPath.set(record.path, [record]);
    }

    let restored = 0;
    let skipped = 0;

    for (const [path, group] of byPath) {
      const file = this.app.vault.getAbstractFileByPath(path);
      if (!(file instanceof TFile)) {
        skipped += group.length;
        Logger.warn(`undo skipped (missing-file) at ${path}`);
        continue;
      }

      const ordered = [...group].sort((a, b) => a.line - b.line);

      await this.app.vault.process(file, (content) => {
        const lines = content.split("\n");
        for (const record of ordered) {
          if (record.after === null) {
            const insertion = deletionInsertionPoint(lines, record);
            // Skip when the original context is no longer unique: restoring to a guessed position
            // is more dangerous than asking the user to recover the line manually.
            if (insertion === null || bareLine(lines[insertion]) === record.before) {
              skipped++;
              Logger.warn(`undo skipped (line moved) at ${path}:${record.line}`);
              continue;
            }
            lines.splice(insertion, 0, record.before ?? "");
            restored++;
            continue;
          }

          const current = lines[record.line];
          if (current === undefined || bareLine(current) !== record.after) {
            skipped++;
            Logger.warn(`undo skipped (conflict) at ${path}:${record.line}`);
            continue;
          }

          if (record.before === null) {
            lines.splice(record.line, 1);
          } else {
            const eol = current.endsWith("\r") ? "\r" : "";
            lines[record.line] = record.before + eol;
          }
          restored++;
        }
        return lines.join("\n");
      });
    }

    return { ok: true, label: entry.label, restored, skipped };
  }
}

function bareLine(line: string | undefined): string | undefined {
  if (line === undefined) return undefined;
  return line.endsWith("\r") ? line.slice(0, -1) : line;
}

function deletionInsertionPoint(lines: string[], record: WriteRecord): number | null {
  if (record.anchorBefore === undefined && record.anchorAfter === undefined) {
    return record.line <= lines.length ? record.line : null;
  }

  const candidates: number[] = [];
  for (let i = 0; i <= lines.length; i++) {
    const before = i === 0 ? null : bareLine(lines[i - 1]);
    const after = i === lines.length ? null : bareLine(lines[i]);
    if (before === record.anchorBefore && after === record.anchorAfter) candidates.push(i);
  }
  return candidates.length === 1 ? candidates[0]! : null;
}
