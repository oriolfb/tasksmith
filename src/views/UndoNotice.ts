import { Notice } from "obsidian";
import type { UndoResult } from "../tasks/TaskWriter";

/** Anything that can revert its last write: `TaskWriter` itself, or `TaskActions` over it. */
export interface Undoable {
  undo(): Promise<UndoResult>;
}

/**
 * A notice for a write that changed the vault, with the undo right inside it.
 *
 * The button is added to `noticeEl` rather than passing a fragment so the message stays a
 * plain string for anything that reads it back. When the host has no DOM (unit tests) the
 * notice degrades to text and the command palette is still the way back.
 */
export function undoableNotice(message: string, writer: Undoable, duration = 9000): void {
  const notice = new Notice(message, duration) as Notice & {
    noticeEl?: HTMLElement;
    hide?: () => void;
  };

  const host = notice.noticeEl;
  if (!host || typeof host.createEl !== "function") return;

  const button = host.createEl("button", { cls: "tc-undo", text: "Desfés" });
  button.addEventListener("click", (event) => {
    event.stopPropagation();
    button.disabled = true;
    void writer.undo().then((result) => {
      notice.hide?.();
      if (!result.ok) return;
      new Notice(
        result.skipped === 0
          ? `Desfet: ${result.label}`
          : `Desfet: ${result.label} · ${result.skipped} línies ja havien canviat`
      );
    });
  });
}
