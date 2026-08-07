import { Menu } from "obsidian";
import type { Task } from "../types/task";
import type { TaskActions } from "../tasks/TaskActions";
import { addDays, startOfToday } from "../index/dates";
import { shortDate } from "./format";

/**
 * The date menu, shared by the dock and the control centre.
 *
 * It is one function and not two because of what sits at the bottom of it: discarding a task
 * has to cost one deliberate step more than postponing it, and that rule is worth exactly as
 * much as the number of places that implement it.
 */
export interface DateMenuCallbacks {
  /** "No ho faré": cancels the line. Async so the menu can wait for the write. */
  onDrop: (task: Task) => Promise<void>;
  onOpen: (task: Task) => void;
  onDone: () => void;
}

export function openDateMenu(
  actions: TaskActions,
  task: Task,
  event: MouseEvent,
  callbacks: DateMenuCallbacks
): void {
  const menu = new Menu();
  const today = startOfToday();

  const entry = (title: string, run: () => Promise<unknown>): void => {
    menu.addItem((item) =>
      item.setTitle(title).onClick(async () => {
        await run();
        callbacks.onDone();
      })
    );
  };

  entry("Demà", () => actions.tomorrow(task));
  entry("Divendres", () => actions.scheduleOn(task, nextFriday(today)));
  entry("Dilluns que ve", () => actions.scheduleOn(task, nextMonday(today)));
  entry("+1 setmana", () => actions.nextWeek(task));
  entry("+1 mes", () => actions.postpone(task, 30));
  // Only when the note actually lends one: the health panel points here instead of dating
  // tasks itself, precisely so each one gets this offer rather than a batch write.
  if (task.noteDate) entry(`Data de la nota (${shortDate(task.noteDate)})`, () => actions.scheduleOn(task, task.noteDate!));
  menu.addSeparator();
  entry("Treure la data", () => actions.clearDue(task));
  menu.addSeparator();
  menu.addItem((item) =>
    item
      .setTitle("Obrir la nota")
      .setIcon("file-text")
      .onClick(() => callbacks.onOpen(task))
  );
  // Last, separated, and marked as a warning: discarding should take one deliberate step more
  // than postponing. It is still undoable — but you should not reach it by accident.
  menu.addSeparator();
  menu.addItem((item) =>
    item
      .setTitle("No ho faré")
      .setIcon("x")
      .setWarning(true)
      .onClick(async () => {
        await callbacks.onDrop(task);
        callbacks.onDone();
      })
  );
  menu.showAtMouseEvent(event);
}

export function nextFriday(today: Date): Date {
  const delta = (5 - today.getDay() + 7) % 7;
  return addDays(today, delta === 0 ? 7 : delta);
}

export function nextMonday(today: Date): Date {
  const delta = (8 - today.getDay()) % 7;
  return addDays(today, delta === 0 ? 7 : delta);
}
