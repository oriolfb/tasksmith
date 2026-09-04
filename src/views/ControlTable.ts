import { setIcon, setTooltip } from "obsidian";
import type { Task } from "../types/task";
import { bucketOf } from "../index/Buckets";
import type { SortKey, TaskGroup } from "../query/Query";
import { noteName, relativeLabel, shortDate } from "./format";
import { t } from "../i18n/strings";
import { makeKeyboardButton } from "./keyboard";

/**
 * The detailed table: Tasca · Termini · Amb qui · Àrea · Origen · Accions.
 *
 * Same language as the dock's list — text hierarchy, one hairline under the header, air instead
 * of rules between rows, background only on hover — with the grid doing the aligning a table of
 * borders would otherwise do. The date is still ochre **text** and never a filled badge: twenty
 * rows carry it, and as badges the list reads as a traffic light.
 *
 * The leading mark is the same tick the dock uses: click it, the task closes; click a closed
 * one, it reopens. It used to be a checkbox for the bulk actions below, and that is exactly the
 * problem it caused — it looked like "done" and did "selected", so ticking a task never closed
 * it and nobody could tell why. Selecting several rows for the bulk bar is now a row gesture
 * instead, the same as a file manager: a plain click picks exactly that row, ⌘/Ctrl-click adds
 * one, Shift-click takes the range in between — so the one mark on the row means one thing, and
 * the wash under a selected row is the only thing that says "selected".
 */
export interface TableColumn {
  key: string;
  label: string;
  /** Columns you can sort by. "Accions" is not one. */
  sort?: SortKey;
}

export const COLUMNS: TableColumn[] = [
  { key: "text", label: t("table.column.text"), sort: "text" },
  { key: "due", label: t("table.column.due"), sort: "date" },
  { key: "who", label: t("table.column.who"), sort: "person" },
  { key: "area", label: t("table.column.area"), sort: "area" },
  { key: "origin", label: t("table.column.origin"), sort: "note" },
  { key: "actions", label: t("table.column.actions") },
];

export interface TableCallbacks {
  onSort: (sort: SortKey) => void;
  onToday: (task: Task) => void;
  onTomorrow: (task: Task) => void;
  onDate: (task: Task, event: MouseEvent) => void;
  onComplete: (task: Task) => void;
  /** The tick of an already-closed task undoes it, same as the dock. */
  onReopen: (task: Task) => void;
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
  /** Rendered order, top to bottom, so Shift-click knows what "the range" means. Reset per render. */
  private order: Task[] = [];
  /**
   * The row element for every task currently on screen, keyed the same way as `selection`. A
   * click only ever changes a handful of rows, but without this map the only way to reflect that
   * change was `render()` — a full repaint of the KPIs, the week strip and every row, which only
   * happens on the next unrelated data refresh. So selecting felt like it "didn't work": the tick
   * mark and the Set were right away, the paint just wasn't. Reset per render, same as `order`.
   */
  private readonly rows = new Map<string, HTMLElement>();
  /** The last row a plain ⌘/Ctrl-click landed on — the anchor a Shift-click ranges from. */
  private anchor: number | null = null;

  constructor(private readonly callbacks: TableCallbacks) {}

  clearSelection(): void {
    this.selection.clear();
    this.anchor = null;
    this.syncSelectionClasses();
    this.callbacks.onSelectionChange();
  }

  selectedFrom(tasks: Task[]): Task[] {
    return tasks.filter((task) => this.selection.has(idOf(task)));
  }

  /** Paints `.tcc-selected` on exactly the rows the Set says are selected — right now, not at the next unrelated repaint. */
  private syncSelectionClasses(): void {
    for (const [id, row] of this.rows) row.toggleClass("tcc-selected", this.selection.has(id));
  }

  render(host: HTMLElement, groups: TaskGroup[], today: Date, state: TableState): void {
    host.empty();
    this.order = [];
    this.rows.clear();

    if (groups.length === 0) {
      host.createDiv({ cls: "tcc-empty", text: t("table.empty") });
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
      setTooltip(
        cell,
        active ? t("table.reverseSort") : t("table.sortBy", { column: column.label.toLowerCase() }),
        { delay: 300 }
      );
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
    const index = this.order.length;
    this.order.push(task);

    const row = host.createDiv({ cls: "tcc-tr" });
    row.dataset.tccKey = idOf(task);
    row.tabIndex = 0;
    if (this.selection.has(idOf(task))) row.addClass("tcc-selected");
    this.rows.set(idOf(task), row);
    this.wireSelectionGesture(row, task, index);

    const mark = row.createDiv({ cls: "tcc-mark" });
    mark.setAttribute("role", "button");
    if (task.open) {
      mark.setAttribute("aria-label", t("row.complete"));
      setTooltip(mark, t("row.complete"), { delay: 300 });
      mark.addEventListener("click", (event) => {
        event.stopPropagation();
        this.callbacks.onComplete(task);
      });
      makeKeyboardButton(mark, () => this.callbacks.onComplete(task));
    } else {
      mark.addClass("tcc-mark-on");
      setIcon(mark, "check");
      mark.setAttribute("aria-label", t("row.reopen"));
      setTooltip(mark, t("row.reopen"), { delay: 300 });
      mark.addEventListener("click", (event) => {
        event.stopPropagation();
        this.callbacks.onReopen(task);
      });
      makeKeyboardButton(mark, () => this.callbacks.onReopen(task));
    }

    const text = row.createSpan({
      cls: "tcc-cell-text",
      text: task.description || t("row.noDescription"),
    });
    if (!task.open) text.addClass("tcc-closed");
    setTooltip(text, task.description || t("row.noDescription"), { delay: 400 });
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
    if (task.project) setTooltip(area, t("table.project", { project: task.project }), { delay: 300 });

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
    this.action(actions, "today", t("action.today"), t("row.todayTooltip"), () => this.callbacks.onToday(task));
    this.action(actions, "tomorrow", t("dateMenu.tomorrow"), t("table.tomorrowTooltip"), () => this.callbacks.onTomorrow(task));
    this.action(actions, "more", "⋮", t("table.moreTooltip"), (event) => this.callbacks.onDate(task, event));
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
      cell.setText(t("kpi.undated.label"));
      cell.setAttribute("role", "button");
      setTooltip(
        cell,
        task.noteDate
          ? t("table.due.noneWithNote", { date: shortDate(task.noteDate) })
          : t("table.due.none"),
        { delay: 300 }
      );
      cell.addEventListener("click", (event) => {
        event.stopPropagation();
        this.callbacks.onDate(task, event);
      });
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
        : t("table.due.inherited", {
            date: shortDate(task.effectiveDate),
            origin: task.noteTitle ?? noteName(task.location.path),
          }),
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
    this.syncSelectionClasses();
    this.callbacks.onSelectionChange();
  }

  /**
   * ⌘/Ctrl-click adds the row and moves the anchor; Shift-click selects everything between the
   * anchor and here, Finder-style. A plain click does the same as Finder too: it picks exactly
   * this row and drops whatever else was selected — everywhere on the row, that is, except the
   * parts that already have their own job and say so with an underline on hover: the task name
   * and the origin note open the task, the tick completes it, the action words run themselves.
   * Captured on the row itself, not bound to a single cell, so it fires *before* those children's
   * own click handlers — a modifier, or a click outside them, means "I am selecting", never "open
   * this" or "complete this".
   */
  private wireSelectionGesture(row: HTMLElement, task: Task, index: number): void {
    row.addEventListener(
      "click",
      (event) => {
        if (event.metaKey || event.ctrlKey) {
          event.preventDefault();
          event.stopPropagation();
          this.toggleSelected(task);
          this.anchor = index;
          return;
        }
        if (event.shiftKey) {
          event.preventDefault();
          event.stopPropagation();
          this.selectRange(index);
          return;
        }
        const target = event.target as HTMLElement;
        if (target.closest(".tcc-mark, .tcc-cell-text, .tcc-cell-origin, .tcc-cell-actions")) return;
        this.selection.clear();
        this.selection.add(idOf(task));
        this.anchor = index;
        this.syncSelectionClasses();
        this.callbacks.onSelectionChange();
      },
      true
    );
  }

  private selectRange(index: number): void {
    const anchor = this.anchor ?? index;
    const [start, end] = anchor <= index ? [anchor, index] : [index, anchor];
    for (let i = start; i <= end; i++) {
      const task = this.order[i];
      if (task) this.selection.add(idOf(task));
    }
    this.anchor = index;
    this.syncSelectionClasses();
    this.callbacks.onSelectionChange();
  }
}

export function idOf(task: Task): string {
  return `${task.location.path}:${task.location.line}`;
}
