import { setTooltip } from "obsidian";
import type { Task } from "../types/task";
import { bucketOf } from "../index/Buckets";
import type { SortKey, TaskGroup } from "../query/Query";
import { noteName, relativeLabel, shortDate } from "./format";

/**
 * The detailed table: Tasca · Termini · Amb qui · Àrea · Origen · Accions.
 *
 * Same language as the dock's list — text hierarchy, one hairline under the header, air instead
 * of rules between rows, background only on hover — with the grid doing the aligning a table of
 * borders would otherwise do. The date is still ochre **text** and never a filled badge: twenty
 * rows carry it, and as badges the list reads as a traffic light.
 *
 * One checkbox per row, for the bulk actions, and the row's own actions are words. The version
 * this replaces had a select checkbox *and* a status button *and* four icons per row.
 */
export interface TableColumn {
  key: string;
  label: string;
  /** Columns you can sort by. "Accions" is not one. */
  sort?: SortKey;
}

export const COLUMNS: TableColumn[] = [
  { key: "text", label: "Tasca", sort: "text" },
  { key: "due", label: "Termini", sort: "date" },
  { key: "who", label: "Amb qui", sort: "person" },
  { key: "area", label: "Àrea", sort: "area" },
  { key: "origin", label: "Origen", sort: "note" },
  { key: "actions", label: "Accions" },
];

export interface TableCallbacks {
  onSort: (sort: SortKey) => void;
  onToday: (task: Task) => void;
  onTomorrow: (task: Task) => void;
  onDate: (task: Task, event: MouseEvent) => void;
  onComplete: (task: Task) => void;
  onOpen: (task: Task) => void;
  onSelectionChange: () => void;
  onToggleGroup: (key: string) => void;
  isCollapsed: (key: string) => boolean;
}

export interface TableState {
  sort: SortKey;
  sortReverse: boolean;
}

export class ControlTable {
  private readonly selection = new Set<string>();

  constructor(private readonly callbacks: TableCallbacks) {}

  clearSelection(): void {
    this.selection.clear();
    this.callbacks.onSelectionChange();
  }

  selectedFrom(tasks: Task[]): Task[] {
    return tasks.filter((task) => this.selection.has(idOf(task)));
  }

  render(host: HTMLElement, groups: TaskGroup[], today: Date, state: TableState): void {
    host.empty();

    if (groups.length === 0) {
      host.createDiv({ cls: "tcc-empty", text: "Cap tasca compleix aquest filtre." });
      return;
    }

    this.renderHead(host, state);

    for (const group of groups) {
      const collapsed = this.callbacks.isCollapsed(group.key);
      // A div with role="button": Obsidian's own styling turns a real <button> into a filled
      // grey box, and a group label is a label.
      const head = host.createDiv({ cls: "tcc-sec" });
      head.setAttribute("role", "button");
      head.tabIndex = 0;
      head.setAttribute("aria-expanded", String(!collapsed));
      head.createSpan({ cls: "tcc-sec-name", text: group.label });
      head.createSpan({ cls: "tcc-sec-count", text: String(group.tasks.length) });
      const toggle = (): void => this.callbacks.onToggleGroup(group.key);
      head.addEventListener("click", toggle);
      head.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        toggle();
      });

      if (collapsed) continue;
      for (const task of group.tasks) this.renderRow(host, task, today);
    }
  }

  private renderHead(host: HTMLElement, state: TableState): void {
    const head = host.createDiv({ cls: "tcc-th" });
    head.createSpan({ cls: "tcc-cell-select" });

    for (const column of COLUMNS) {
      const cell = head.createSpan({ cls: `tcc-th-cell tcc-cell-${column.key}` });
      if (!column.sort) {
        cell.setText(column.label);
        continue;
      }
      const active = state.sort === column.sort;
      cell.setText(active ? `${column.label} ${state.sortReverse ? "↑" : "↓"}` : column.label);
      if (active) cell.addClass("tcc-th-on");
      cell.setAttribute("role", "button");
      cell.tabIndex = 0;
      setTooltip(cell, active ? "Girar l'ordre" : `Ordenar per ${column.label.toLowerCase()}`, { delay: 300 });
      const sort = (): void => this.callbacks.onSort(column.sort!);
      cell.addEventListener("click", sort);
      cell.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        sort();
      });
    }
  }

  private renderRow(host: HTMLElement, task: Task, today: Date): void {
    const row = host.createDiv({ cls: "tcc-tr" });
    row.dataset.tccKey = idOf(task);
    row.tabIndex = 0;

    const box = row.createEl("input", { cls: "tcc-select", type: "checkbox" });
    box.checked = this.selection.has(idOf(task));
    box.setAttribute("aria-label", "Seleccionar");
    box.addEventListener("click", (event) => {
      event.stopPropagation();
      this.toggleSelected(task, box.checked);
    });

    const text = row.createSpan({
      cls: "tcc-cell-text",
      text: task.description || "(sense descripció)",
    });
    if (!task.open) text.addClass("tcc-closed");
    setTooltip(text, task.description || "(sense descripció)", { delay: 400 });
    text.addEventListener("click", () => this.callbacks.onOpen(task));

    this.renderDue(row, task, today);

    const people = row.createSpan({ cls: "tcc-cell-who" });
    if (task.people.length === 0) {
      people.addClass("tcc-none");
      people.setText("—");
    } else {
      people.setText(task.people.length > 1 ? `${task.people[0]} +${task.people.length - 1}` : task.people[0]!);
      setTooltip(people, task.people.join(", "), { delay: 300 });
    }

    // The column says Àrea and sorts by Àrea, so it shows the area. `Projecte` — the key that is
    // usually empty in this vault — rides along in the tooltip rather than competing for the cell.
    const area = row.createSpan({ cls: "tcc-cell-area", text: task.area ?? "—" });
    if (!task.area) area.addClass("tcc-none");
    if (task.project) setTooltip(area, `Projecte: ${task.project}`, { delay: 300 });

    const origin = row.createSpan({
      cls: "tcc-cell-origin",
      text: task.noteTitle ?? noteName(task.location.path),
    });
    setTooltip(origin, task.location.path, { delay: 300 });
    origin.addEventListener("click", () => this.callbacks.onOpen(task));

    /*
     * Words, not buttons, and only on the row you are on: a <button> here inherits the theme's
     * padding, background and radius, and three grey pills per row weigh more than the task.
     *
     * Two classes, not one: `tcc-cell-actions` places the column and `tcc-acts` hides the words
     * until you hover. When one class did both jobs, the *header* cell inherited `opacity: 0`
     * and "Accions" was invisible — same shape of mistake as `lead.className = "ord"`.
     */
    const actions = row.createDiv({ cls: "tcc-cell-actions tcc-acts" });
    this.action(actions, "done", "Fet", "Completar", () => this.callbacks.onComplete(task));
    this.action(actions, "today", "Avui", "Posar-la al dia d'avui", () => this.callbacks.onToday(task));
    this.action(actions, "tomorrow", "Demà", "Posar-la demà", () => this.callbacks.onTomorrow(task));
    this.action(actions, "date", "Data", "Data, o descartar-la", (event) => this.callbacks.onDate(task, event));
  }

  /**
   * The deadline as text. Ochre when it is past — the only colour in the column — and the
   * tooltip says whether the date is the task's own or inherited from its note.
   */
  private renderDue(row: HTMLElement, task: Task, today: Date): void {
    const bucket = bucketOf(task, today);
    const cell = row.createSpan({ cls: "tcc-cell-due" });

    if (bucket === "undated") {
      cell.addClass("tcc-none");
      cell.setText("sense data");
      setTooltip(
        cell,
        task.noteDate
          ? `Sense data. La nota porta ${shortDate(task.noteDate)}, que no compta com a termini.`
          : "Sense data.",
        { delay: 300 }
      );
      return;
    }

    cell.setText(relativeLabel(task.effectiveDate, today));
    if (bucket === "overdue") cell.addClass("tcc-late");
    if (bucket === "today") cell.addClass("tcc-now");

    const own = task.fields.due?.date ?? task.fields.scheduled?.date ?? task.fields.start?.date;
    setTooltip(
      cell,
      own
        ? shortDate(task.effectiveDate)
        : `${shortDate(task.effectiveDate)} · heretada de ${task.noteTitle ?? noteName(task.location.path)}`,
      { delay: 300 }
    );
  }

  private action(
    host: HTMLElement,
    act: string,
    label: string,
    tooltip: string,
    run: (event: MouseEvent) => void
  ): void {
    const word = host.createSpan({ cls: "tcc-act", text: label });
    word.dataset.act = act;
    word.setAttribute("role", "button");
    word.setAttribute("aria-label", tooltip);
    setTooltip(word, tooltip, { delay: 300 });
    word.addEventListener("click", (event) => {
      event.stopPropagation();
      run(event);
    });
  }

  toggleSelected(task: Task, selected = !this.selection.has(idOf(task))): void {
    if (selected) this.selection.add(idOf(task));
    else this.selection.delete(idOf(task));
    this.callbacks.onSelectionChange();
  }
}

export function idOf(task: Task): string {
  return `${task.location.path}:${task.location.line}`;
}
