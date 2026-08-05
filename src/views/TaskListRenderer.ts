import { type App, Menu, Notice, TFile, setIcon, setTooltip } from "obsidian";
import type { Priority, Task } from "../types/task";
import type { TaskActions } from "../tasks/TaskActions";
import { bucketOf } from "../index/Buckets";
import { markerForPriority } from "../index/TaskParser";
import type { TaskGroup } from "../query/Query";
import { noteName, relativeLabel, shortDate } from "./format";

const PRIORITIES: Priority[] = ["highest", "high", "medium", "low", "lowest"];

export interface RendererOptions {
  /** Wide layout adds the note and project columns plus multi-select. */
  wide: boolean;
  selectable: boolean;
}

interface QuickAction {
  icon: string;
  tooltip: string;
  run: (task: Task) => Promise<unknown>;
}

export class TaskListRenderer {
  private collapsed = new Set<string>();
  readonly selection = new Set<string>();

  constructor(
    private readonly app: App,
    private readonly actions: TaskActions,
    private readonly options: RendererOptions,
    private readonly onSelectionChange: () => void = () => {}
  ) {}

  clearSelection(): void {
    this.selection.clear();
    this.onSelectionChange();
  }

  selectedFrom(tasks: Task[]): Task[] {
    return tasks.filter((task) => this.selection.has(idOf(task)));
  }

  render(host: HTMLElement, groups: TaskGroup[], today: Date): void {
    host.empty();
    if (groups.length === 0) {
      const empty = host.createDiv({ cls: "tc-empty" });
      empty.setText("Res per aquí. Cap tasca compleix el filtre.");
      return;
    }

    for (const group of groups) {
      const section = host.createDiv({ cls: "tc-group" });
      const header = section.createDiv({ cls: "tc-group-header" });
      const chevron = header.createSpan({ cls: "tc-chevron" });
      setIcon(chevron, this.collapsed.has(group.key) ? "chevron-right" : "chevron-down");
      header.createSpan({ cls: "tc-group-label", text: group.label });
      header.createSpan({ cls: "tc-group-count", text: String(group.tasks.length) });
      if (group.key === "overdue") header.addClass("tc-overdue");

      const body = section.createDiv({ cls: "tc-group-body" });
      if (this.collapsed.has(group.key)) body.addClass("tc-hidden");

      header.addEventListener("click", () => {
        if (this.collapsed.has(group.key)) this.collapsed.delete(group.key);
        else this.collapsed.add(group.key);
        setIcon(chevron, this.collapsed.has(group.key) ? "chevron-right" : "chevron-down");
        body.toggleClass("tc-hidden", this.collapsed.has(group.key));
      });

      for (const task of group.tasks) this.renderRow(body, task, today);
    }
  }

  private renderRow(host: HTMLElement, task: Task, today: Date): void {
    const row = host.createDiv({ cls: "tc-row" });
    if (this.options.wide) row.addClass("tc-row-wide");

    if (this.options.selectable) {
      const box = row.createEl("input", { cls: "tc-select", type: "checkbox" });
      box.checked = this.selection.has(idOf(task));
      box.addEventListener("click", (event) => {
        event.stopPropagation();
        if (box.checked) this.selection.add(idOf(task));
        else this.selection.delete(idOf(task));
        this.onSelectionChange();
      });
    }

    const status = row.createEl("button", { cls: "tc-status" });
    status.setAttribute("aria-label", "Canviar estat");
    status.setText(task.status === " " ? "" : task.status);
    status.addClass(`tc-status-${statusClass(task.status)}`);
    status.addEventListener("click", async (event) => {
      event.stopPropagation();
      await this.actions.cycleStatus(task);
    });

    const main = row.createDiv({ cls: "tc-main" });
    const text = main.createDiv({ cls: "tc-text", text: task.description || "(sense descripció)" });
    if (!task.open) text.addClass("tc-done");
    text.addEventListener("click", () => void this.openTask(task));

    const meta = main.createDiv({ cls: "tc-meta" });

    const bucket = bucketOf(task, today);
    const date = meta.createSpan({ cls: "tc-date", text: relativeLabel(task.effectiveDate, today) });
    if (bucket === "overdue") date.addClass("tc-overdue");
    if (bucket === "today") date.addClass("tc-today");
    if (bucket === "undated") date.addClass("tc-undated");

    // The dotted underline means the task owns no date: it inherits the daily note's.
    // The tooltip is the whole explanation, so it says where the date comes from.
    const inherited =
      !task.fields.due?.date && !task.fields.scheduled?.date && !task.fields.start?.date && task.filenameDate;
    if (inherited) date.addClass("tc-implicit");
    setTooltip(
      date,
      inherited
        ? `${shortDate(task.effectiveDate)} · sense data pròpia, heretada de ${noteName(task.location.path)}`
        : shortDate(task.effectiveDate),
      { delay: 120 }
    );

    if (task.priority) meta.createSpan({ cls: "tc-prio", text: markerForPriority(task.priority) });
    if (task.fields.recurrence) meta.createSpan({ cls: "tc-recur", text: "🔁" });
    if (task.project) meta.createSpan({ cls: "tc-chip", text: task.project });
    if (this.options.wide) {
      const note = meta.createSpan({ cls: "tc-note", text: noteName(task.location.path) });
      setTooltip(note, task.location.path, { delay: 120 });
      note.addEventListener("click", () => void this.openTask(task));
    }

    const tools = row.createDiv({ cls: "tc-actions" });
    for (const action of this.quickActions()) {
      const button = tools.createEl("button", { cls: "tc-action" });
      setIcon(button, action.icon);
      button.setAttribute("aria-label", action.tooltip);
      setTooltip(button, action.tooltip, { delay: 120 });
      button.addEventListener("click", async (event) => {
        event.stopPropagation();
        await action.run(task);
      });
    }

    const more = tools.createEl("button", { cls: "tc-action" });
    setIcon(more, "more-horizontal");
    more.setAttribute("aria-label", "Més accions");
    setTooltip(more, "Més accions", { delay: 120 });
    more.addEventListener("click", (event) => {
      event.stopPropagation();
      this.showMenu(event, task);
    });
  }

  private quickActions(): QuickAction[] {
    return [
      { icon: "calendar-check", tooltip: "Avui", run: (task) => this.actions.today(task) },
      { icon: "calendar-plus", tooltip: "Demà", run: (task) => this.actions.tomorrow(task) },
      { icon: "calendar-clock", tooltip: "+1 setmana", run: (task) => this.actions.nextWeek(task) },
      { icon: "check", tooltip: "Completar", run: (task) => this.actions.complete(task) },
    ];
  }

  private showMenu(event: MouseEvent, task: Task): void {
    const menu = new Menu();

    menu.addItem((item) =>
      item
        .setTitle("Obrir la nota")
        .setIcon("file-text")
        .onClick(() => void this.openTask(task))
    );

    for (const days of [2, 3, 7, 30]) {
      menu.addItem((item) =>
        item
          .setTitle(`Posposar ${days} dies`)
          .setIcon("clock")
          .onClick(async () => {
            await this.actions.postpone(task, days);
          })
      );
    }

    menu.addSeparator();
    for (const priority of PRIORITIES) {
      menu.addItem((item) =>
        item
          .setTitle(`Prioritat ${markerForPriority(priority)}`)
          .setChecked(task.priority === priority)
          .onClick(async () => {
            await this.actions.setPriority(task, task.priority === priority ? null : priority);
          })
      );
    }

    menu.addSeparator();
    menu.addItem((item) =>
      item
        .setTitle("Treure la data")
        .setIcon("calendar-x")
        .onClick(async () => {
          await this.actions.clearDue(task);
        })
    );
    menu.addItem((item) =>
      item
        .setTitle(task.open ? "Cancel·lar" : "Reobrir")
        .setIcon(task.open ? "x" : "rotate-ccw")
        .onClick(async () => {
          if (task.open) await this.actions.cancel(task);
          else await this.actions.reopen(task);
        })
    );

    menu.addSeparator();
    menu.addItem((item) =>
      item
        .setTitle("Eliminar la tasca")
        .setIcon("trash-2")
        .setWarning(true)
        .onClick(async () => {
          await this.actions.remove(task);
        })
    );

    menu.showAtMouseEvent(event);
  }

  private async openTask(task: Task): Promise<void> {
    const file = this.app.vault.getAbstractFileByPath(task.location.path);
    if (!(file instanceof TFile)) {
      new Notice(`No trobo ${task.location.path}`);
      return;
    }
    const leaf = this.app.workspace.getLeaf(false);
    await leaf.openFile(file, { eState: { line: task.location.line } });
  }
}

export function idOf(task: Task): string {
  return `${task.location.path}:${task.location.line}`;
}

function statusClass(symbol: string): string {
  if (symbol === " ") return "todo";
  if (symbol === "x") return "done";
  if (symbol === "/") return "doing";
  if (symbol === "-") return "cancelled";
  return "other";
}
