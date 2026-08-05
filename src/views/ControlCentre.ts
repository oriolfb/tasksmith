import { Menu, Notice, TFile, setIcon, setTooltip, type WorkspaceLeaf } from "obsidian";
import type { TaskIndex } from "../index/TaskIndex";
import type { TaskActions } from "../tasks/TaskActions";
import type { TaskConsoleSettings } from "../settings/Config";
import type { Task } from "../types/task";
import { BaseTaskView } from "./BaseTaskView";
import { ConfirmModal } from "./ConfirmModal";
import { PromptModal } from "./PromptModal";
import { undoableNotice } from "./UndoNotice";
import { ControlTable, idOf } from "./ControlTable";
import { openDateMenu, nextFriday } from "./DateMenu";
import { PickModal } from "./PickModal";
import { decimal, monthLabel, shortDate } from "./format";
import {
  DEFAULT_QUERY,
  NO_PROJECT,
  countByKind,
  type GroupKey,
  type QueryState,
  type SortKey,
  type TaskGroup,
} from "../query/Query";
import { describeFilters, filterMenu, type ChipContext } from "../query/Filters";
import {
  closingState,
  monthlyClosed,
  openState,
  type ClosingState,
  type MonthlyClosed,
  type OpenState,
} from "../query/Metrics";
import { healthFindings, type Finding } from "../query/Health";
import { startOfToday } from "../index/dates";

/** Unchanged on purpose: an existing workspace layout keeps opening this tab. */
export const CONTROL_CENTRE_VIEW = "task-console-triage";

type Lens = { key: GroupKey; label: string };

const LENSES: Lens[] = [
  { key: "bucket", label: "Per data" },
  { key: "person", label: "Amb qui" },
  { key: "area", label: "Per àrea" },
];

const SORT_LABELS: Record<SortKey, string> = {
  date: "termini",
  age: "antiguitat",
  text: "tasca",
  person: "amb qui",
  area: "àrea",
  note: "origen",
  priority: "prioritat",
};

/** How many months of throughput fit the strip without the bars turning into hairs. */
const CHART_MONTHS = 8;

/** Tallest bar, in pixels. The strip is a sparkline, not a chart you read values off. */
const BAR_HEIGHT = 42;

/**
 * The control centre.
 *
 * Two roles, not two lists: the dock answers *what do I do now*, this tab answers *how is the
 * system doing*. Hence the KPI strip, the throughput chart and the health panel, and hence no
 * three-slot day plan here.
 *
 * The numbers above the table describe the **vault**, not the filter. A strip that moved with
 * every chip would answer nothing — you would never know whether 18 overdue meant the vault or
 * your current search.
 */
export class ControlCentreView extends BaseTaskView {
  private table: ControlTable;
  private collapsed = new Set<string>();

  private tabs = new Map<GroupKey, HTMLElement>();
  private kpiHost!: HTMLElement;
  private chartHost!: HTMLElement;
  private searchInput!: HTMLInputElement;
  private chipHost!: HTMLElement;
  private summaryEl!: HTMLElement;
  private tableHost!: HTMLElement;
  private healthHost!: HTMLElement;
  private footerHost!: HTMLElement;

  constructor(
    leaf: WorkspaceLeaf,
    index: TaskIndex,
    actions: TaskActions,
    settings: TaskConsoleSettings,
    private readonly openFocus: () => void,
    private readonly persist: () => Promise<void>
  ) {
    super(leaf, index, actions, settings);
    this.table = new ControlTable({
      onSort: (sort) => this.sortBy(sort),
      onToday: (task) => void this.actions.today(task),
      onComplete: (task) => void this.actions.complete(task),
      onDate: (task, event) => this.dateMenu(task, event),
      onOpen: (task) => void this.openTask(task),
      onSelectionChange: () => this.renderFooter(),
      onToggleGroup: (key) => this.toggleGroup(key),
      isCollapsed: (key) => this.collapsed.has(key),
    });
  }

  getViewType(): string {
    return CONTROL_CENTRE_VIEW;
  }

  getDisplayText(): string {
    return "Centre de control";
  }

  getIcon(): string {
    return "layout-list";
  }

  protected build(): void {
    const root = this.containerEl.children[1] as HTMLElement;
    root.empty();
    root.addClass("tcc");

    const head = root.createDiv({ cls: "tcc-head" });
    for (const lens of LENSES) {
      const tab = head.createEl("button", { cls: "tcf-tab", text: lens.label });
      tab.addEventListener("click", () => this.setLens(lens.key));
      this.tabs.set(lens.key, tab);
    }

    const tools = head.createDiv({ cls: "tcc-head-tools" });
    const views = tools.createDiv({ cls: "clickable-icon tcf-icon" });
    setIcon(views, "bookmark");
    views.setAttribute("aria-label", "Vistes desades");
    setTooltip(views, "Vistes desades", { delay: 300 });
    views.addEventListener("click", (event) => this.savedViewsMenu(event));

    // A real button, because this one really is a button: it takes you to the dock to decide
    // the day. Obsidian's own styling is what it should look like.
    const plan = tools.createEl("button", { cls: "tcc-plan", text: "Planificar el dia" });
    plan.addEventListener("click", () => this.openFocus());

    this.kpiHost = root.createDiv({ cls: "tcc-kpis" });
    this.chartHost = root.createDiv({ cls: "tcc-chart" });

    const filters = root.createDiv({ cls: "tcc-filters" });
    this.searchInput = filters.createEl("input", { cls: "tcc-search", type: "search" });
    this.searchInput.placeholder = "Cerca…";
    this.searchInput.addEventListener("input", () => {
      this.query = { ...this.query, text: this.searchInput.value };
      this.refresh();
    });
    this.chipHost = filters.createDiv({ cls: "tcc-chips" });
    this.summaryEl = filters.createSpan({ cls: "tcc-summary" });

    const layout = root.createDiv({ cls: "tcc-layout" });
    this.tableHost = layout.createDiv({ cls: "tcc-table" });
    this.tableHost.addEventListener("keydown", (event) => this.onKey(event));
    this.healthHost = layout.createDiv({ cls: "tcc-health" });

    this.footerHost = root.createDiv({ cls: "tcc-footer" });
  }

  protected paint(groups: TaskGroup[], today: Date): void {
    const all = this.index.all();
    // Measured once per paint and handed down: the strip, the chart and the summary line all
    // describe the same vault, and computing it three times invites them to disagree.
    const open = openState(all, today);
    const closings = closingState(all, today);

    for (const [key, tab] of this.tabs) tab.toggleClass("tcf-tab-on", this.query.group === key);

    this.renderKpis(open, closings);
    this.renderChart(all, closings, today);
    this.renderChips(all);
    this.table.render(this.tableHost, groups, today, {
      sort: this.query.sort,
      sortReverse: this.query.sortReverse,
    });
    this.renderSummary(groups, open, closings);
    this.renderHealth(all, today);
    this.renderFooter();

    if (this.searchInput.value !== this.query.text) this.searchInput.value = this.query.text;
  }

  /* ── the strip ─────────────────────────────────────────── */

  private renderKpis(open: OpenState, closings: ClosingState): void {
    this.kpiHost.empty();

    this.kpi({
      value: String(open.open),
      label: "obertes",
      detail: `en ${open.notes} ${open.notes === 1 ? "nota" : "notes"}`,
      filter: { statusScope: "open", buckets: null, staleOnly: false },
    });

    this.kpi({
      value: String(open.renegotiate),
      label: "per renegociar",
      detail:
        open.oldestOverdueDays === null
          ? "cap endarrerida"
          : `la més antiga fa ${open.oldestOverdueDays} dies`,
      late: true,
      filter: { statusScope: "open", buckets: ["overdue"], sort: "age", sortReverse: false },
    });

    this.kpi({
      value: String(open.undated),
      label: "sense data",
      detail:
        open.datableFromNote > 0
          ? `${open.datableFromNote} amb data a la nota`
          : "cap classificable pel frontmatter",
      filter: { statusScope: "open", buckets: ["undated"] },
    });

    /*
     * Measured capacity, and the reason the focus view has three slots and not ten. It is the
     * only KPI that is not a count of what is pending: it is what actually gets closed.
     */
    this.kpi({
      value: closings.perWorkingDay === null ? "—" : decimal(closings.perWorkingDay),
      label: "tancades/dia laborable",
      detail:
        closings.first === null
          ? "cap tasca tancada amb data"
          : `${closings.done} amb ✅ des de ${shortDate(closings.first)}`,
      filter: { statusScope: "closed", buckets: null, staleOnly: false },
    });
  }

  private kpi(spec: {
    value: string;
    label: string;
    detail: string;
    late?: boolean;
    filter: Partial<QueryState>;
  }): void {
    const cell = this.kpiHost.createDiv({ cls: "tcc-kpi" });
    cell.setAttribute("role", "button");
    cell.tabIndex = 0;
    setTooltip(cell, `Filtrar: ${spec.label}`, { delay: 400 });
    const value = cell.createDiv({ cls: "tcc-kpi-value", text: spec.value });
    if (spec.late) value.addClass("tcc-late");
    cell.createDiv({ cls: "tcc-kpi-label", text: spec.label });
    cell.createDiv({ cls: "tcc-kpi-detail", text: spec.detail });

    const apply = (): void => this.applyFilter(spec.filter);
    cell.addEventListener("click", apply);
    cell.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      apply();
    });
  }

  /**
   * Closed per month. Bars scaled to the busiest month in the window, with the month in progress
   * marked — otherwise August always looks like a collapse on the 5th.
   */
  private renderChart(all: Task[], closings: ClosingState, today: Date): void {
    const months = monthlyClosed(all, today, CHART_MONTHS);
    const peak = Math.max(1, ...months.map((month) => month.total));

    this.chartHost.empty();
    const bars = this.chartHost.createDiv({ cls: "tcc-bars" });
    for (const month of months) {
      const column = bars.createDiv({ cls: "tcc-bar-col" });
      column.createSpan({ cls: "tcc-bar-value", text: month.total === 0 ? "" : String(month.total) });
      const bar = column.createDiv({ cls: "tcc-bar" });
      // Pixels, not percentages: a percentage height inside a flex column resolves against a
      // box whose height the labels also share, and the tall months would overflow the strip.
      bar.style.height = `${2 + Math.round((month.total / peak) * BAR_HEIGHT)}px`;
      if (month.current) bar.addClass("tcc-bar-now");
      column.createSpan({ cls: "tcc-bar-month", text: monthLabel(month.year, month.month, today) });
      setTooltip(column, this.monthTooltip(month, today), { delay: 200 });
    }

    const caption = this.chartHost.createDiv({ cls: "tcc-chart-note" });
    caption.appendText("Tancades per mes. ");
    if (closings.perWorkingDay !== null) {
      caption.appendText("La mitjana real és ");
      caption.createEl("b", { text: `${decimal(closings.perWorkingDay)} al dia laborable` });
      caption.appendText(" — per això la vista d'enfocament té tres caselles i no deu.");
    } else {
      caption.appendText("Cap tasca tancada amb data encara, així que no hi ha mitjana a mesurar.");
    }
  }

  private monthTooltip(month: MonthlyClosed, today: Date): string {
    const name = monthLabel(month.year, month.month, today);
    const parts = [`${month.total} tancades el ${name}`];
    if (month.cancelled > 0) parts.push(`${month.done} amb ✅ · ${month.cancelled} amb ❌`);
    if (month.current) parts.push("mes en curs");
    return parts.join("\n");
  }

  /* ── the filter sentence ───────────────────────────────── */

  private chipContext(all: Task[]): ChipContext {
    const kinds = countByKind(all);
    return {
      staleThresholdDays: this.settings.staleThresholdDays,
      referenceLines: kinds.reference,
      somedayLines: kinds.someday,
    };
  }

  private renderChips(all: Task[]): void {
    const ctx = this.chipContext(all);
    this.chipHost.empty();

    for (const chip of describeFilters(this.query, ctx)) {
      const el = this.chipHost.createSpan({ cls: "tcc-chip" });
      el.createSpan({ text: chip.label });
      const clear = el.createSpan({ cls: "tcc-chip-x", text: "×" });
      clear.setAttribute("role", "button");
      clear.setAttribute("aria-label", `Treure «${chip.label}»`);
      clear.addEventListener("click", () => this.applyFilter(chip.clear));
    }

    const add = this.chipHost.createSpan({ cls: "tcc-chip tcc-chip-add", text: "+ filtre" });
    add.setAttribute("role", "button");
    add.tabIndex = 0;
    add.addEventListener("click", (event) => this.openFilterMenu(event, ctx));
  }

  private openFilterMenu(event: MouseEvent, ctx: ChipContext): void {
    const menu = new Menu();

    for (const group of filterMenu(this.query, ctx)) {
      // `setIsLabel` is the public way to put a heading in a menu; a disabled item still reads
      // as something that ought to be clickable.
      menu.addItem((item) => item.setTitle(group.label).setIsLabel(true));
      for (const option of group.options) {
        menu.addItem((item) =>
          item
            .setTitle(option.label)
            .setChecked(option.checked)
            .onClick(() => this.applyFilter(option.patch))
        );
      }
      menu.addSeparator();
    }

    this.pickFilter(menu, "Projecte", () => this.projects(), (value) => ({ project: value, area: null }));
    this.pickFilter(menu, "Àrea", () => this.areas(), (value) => ({ area: value, project: null }));
    this.pickFilter(menu, "Persona", () => this.people(), (value) => ({ person: value }));

    menu.addSeparator();
    menu.addItem((item) =>
      item
        .setTitle("Treure tots els filtres")
        .setIcon("filter-x")
        .onClick(() =>
          this.applyFilter({
            text: "",
            statusScope: "open",
            buckets: null,
            project: null,
            area: null,
            person: null,
            staleOnly: false,
            includeReference: false,
            includeSomeday: false,
          })
        )
    );

    menu.showAtMouseEvent(event);
  }

  /** Projects, areas and people come from the vault, so their lists are built here. */
  private pickFilter(
    menu: Menu,
    label: string,
    values: () => string[],
    patch: (value: string) => Partial<QueryState>
  ): void {
    menu.addItem((item) =>
      item
        .setTitle(`${label}…`)
        .setIcon("filter")
        .onClick(async () => {
          const options = values();
          if (options.length === 0) {
            new Notice(`Cap ${label.toLowerCase()} a les tasques obertes`);
            return;
          }
          const chosen = await PickModal.ask(this.app, `${label}…`, options);
          if (chosen !== null) this.applyFilter(patch(chosen));
        })
    );
  }

  private projects(): string[] {
    const values = new Set<string>();
    for (const task of this.index.all()) if (task.open) values.add(task.project ?? NO_PROJECT);
    return [...values].sort((a, b) => a.localeCompare(b));
  }

  private areas(): string[] {
    const values = new Set<string>();
    for (const task of this.index.all()) if (task.open && task.area) values.add(task.area);
    return [...values].sort((a, b) => a.localeCompare(b));
  }

  private people(): string[] {
    const values = new Set<string>();
    for (const task of this.index.all()) if (task.open) for (const person of task.people) values.add(person);
    return [...values].sort((a, b) => a.localeCompare(b));
  }

  /**
   * "14 de 33 obertes · ordenat per antiguitat". The total is whatever the status filter allows,
   * not always the open count — "14 de 33 obertes" while looking at closed tasks is a lie the
   * mockup's version would have told.
   */
  private renderSummary(groups: TaskGroup[], open: OpenState, closings: ClosingState): void {
    // A task can sit under two people at once, so the rows are de-duplicated before counting.
    const shown = new Set(groups.flatMap((group) => group.tasks.map(idOf))).size;
    const scope = this.query.statusScope;
    const total = scope === "open" ? open.open : scope === "closed" ? closings.closed : open.open + closings.closed;
    const what = scope === "open" ? "obertes" : scope === "closed" ? "tancades" : "línies";
    const order = SORT_LABELS[this.query.sort];
    const direction = this.query.sortReverse ? " ↑" : "";
    this.summaryEl.setText(`${shown} de ${total} ${what} · ordenat per ${order}${direction}`);
  }

  /* ── the health panel ──────────────────────────────────── */

  private renderHealth(all: Task[], today: Date): void {
    const findings = healthFindings(all, {
      today,
      staleThresholdDays: this.settings.staleThresholdDays,
      mtimeOf: (path) => this.index.mtimeOf(path),
      autoDeleteEmptyTasks: this.settings.autoDeleteEmptyTasks,
      notes: new Set(all.map((task) => task.location.path)).size,
      lines: all.length,
    });

    this.healthHost.empty();
    this.healthHost.createDiv({ cls: "tcc-health-title", text: "Salut del sistema" });
    if (findings.length === 0) {
      this.healthHost.createDiv({ cls: "tcc-health-detail", text: "Res a arreglar." });
      return;
    }
    for (const finding of findings) this.renderFinding(finding);
  }

  private renderFinding(finding: Finding): void {
    const item = this.healthHost.createDiv({ cls: "tcc-finding" });
    if (finding.tone === "ok") item.addClass("tcc-finding-ok");
    item.createDiv({ cls: "tcc-finding-title", text: finding.title });
    item.createDiv({ cls: "tcc-finding-detail", text: finding.detail });
    if (!finding.action) return;

    const action = item.createSpan({ cls: "tcc-finding-action", text: finding.action });
    action.setAttribute("role", "button");
    action.tabIndex = 0;
    const run = (): void => {
      if (finding.filter) this.applyFilter(finding.filter);
      else if (finding.fix === "apply-note-date") void this.applyNoteDates(finding.tasks ?? []);
    };
    action.addEventListener("click", run);
    action.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      run();
    });
  }

  /**
   * The one fix in the panel that writes: it copies each note's own `data:` onto its undated
   * tasks. Guarded, single-line, one undo step for the batch — and it asks first, because it
   * touches several notes at once.
   */
  private async applyNoteDates(tasks: Task[]): Promise<void> {
    const datable = tasks.filter((task) => task.noteDate !== null);
    if (datable.length === 0) return;

    const confirmed = await ConfirmModal.ask(
      this.app,
      "Posar-hi la data de la nota",
      `S'afegirà 📅 a ${datable.length} ${datable.length === 1 ? "tasca" : "tasques"}, cada una amb la data ` +
        `de la seva nota. Es pot desfer amb «Desfés».`,
      `Datar ${datable.length}`
    );
    if (!confirmed) return;

    await this.bulk(datable, (task) => this.actions.scheduleOn(task, task.noteDate!), "Data de la nota");
  }

  /* ── the footer: selection, or the keys ────────────────── */

  private renderFooter(): void {
    const selected = this.table.selectedFrom(this.index.all());
    this.footerHost.empty();

    if (selected.length === 0) {
      const keys = this.footerHost.createDiv({ cls: "tcf-keys" });
      for (const [key, what] of [
        ["J K", "moure"],
        ["Espai", "seleccionar"],
        ["A", "avui"],
        ["D", "data"],
        ["X", "fet"],
        ["O", "obrir"],
        ["/", "cerca"],
      ]) {
        const hint = keys.createSpan();
        hint.createEl("b", { text: key });
        hint.appendText(` ${what}`);
      }
      return;
    }

    const bar = this.footerHost.createDiv({ cls: "tcc-bulk" });
    bar.createSpan({
      cls: "tcc-bulk-count",
      text: `${selected.length} ${selected.length === 1 ? "seleccionada" : "seleccionades"}`,
    });

    const actions: [string, () => Promise<void>][] = [
      ["Avui", () => this.bulk(selected, (task) => this.actions.today(task), "Avui")],
      ["Demà", () => this.bulk(selected, (task) => this.actions.tomorrow(task), "Demà")],
      ["Divendres", () => this.bulk(selected, (task) => this.actions.scheduleOn(task, nextFriday(startOfToday())), "Divendres")],
      ["+1 setmana", () => this.bulk(selected, (task) => this.actions.nextWeek(task), "+1 setmana")],
      ["Treure la data", () => this.bulk(selected, (task) => this.actions.clearDue(task), "Treure la data")],
    ];
    for (const [label, run] of actions) {
      const word = bar.createSpan({ cls: "tcc-act", text: label });
      word.setAttribute("role", "button");
      word.addEventListener("click", () => void run());
    }

    // Cancelling and deleting sit apart from the reschedules, and read as warnings.
    const cancel = bar.createSpan({ cls: "tcc-act tcc-act-warn", text: "No ho faré" });
    cancel.setAttribute("role", "button");
    cancel.addEventListener("click", () => void this.bulkCancel(selected));

    const remove = bar.createSpan({ cls: "tcc-act tcc-act-warn", text: "Eliminar" });
    remove.setAttribute("role", "button");
    remove.addEventListener("click", () => void this.bulkDelete(selected));

    const clear = bar.createSpan({ cls: "tcc-act tcc-bulk-clear", text: "Desmarcar" });
    clear.setAttribute("role", "button");
    clear.addEventListener("click", () => this.table.clearSelection());
  }

  private async bulkCancel(tasks: Task[]): Promise<void> {
    const confirmed = await ConfirmModal.ask(
      this.app,
      "No les faré",
      `Es cancel·laran ${tasks.length} tasques (${"- [-]"} amb ❌). No s'esborra res i es pot desfer.`,
      `Cancel·lar ${tasks.length}`
    );
    if (!confirmed) return;
    await this.bulk(tasks, (task) => this.actions.cancel(task), "Cancel·lar");
  }

  /** Deleting several lines at once still asks first, even though it can now be undone. */
  private async bulkDelete(tasks: Task[]): Promise<void> {
    const confirmed = await ConfirmModal.ask(
      this.app,
      "Eliminar tasques",
      `S'eliminaran ${tasks.length} línies de les seves notes. Es pot desfer amb «Desfés».`,
      `Eliminar ${tasks.length}`
    );
    if (!confirmed) return;

    const { deleted, skipped } = await this.actions.removeMany(tasks);
    this.table.clearSelection();
    undoableNotice(
      skipped === 0 ? `${deleted} tasques eliminades` : `${deleted} eliminades, ${skipped} omeses`,
      this.actions
    );
  }

  /**
   * Sequential on purpose: each write re-reads the file, so parallel edits would conflict.
   * The whole batch is one history entry, so undoing a bulk action is one step and not twenty.
   */
  private async bulk(tasks: Task[], run: (task: Task) => Promise<unknown>, label: string): Promise<void> {
    this.actions.beginGroup(`${label} · ${tasks.length} tasques`);
    let done = 0;
    let skipped = 0;
    try {
      for (const task of tasks) {
        const result = (await run(task)) as { ok?: boolean } | null;
        if (result && result.ok === false) skipped++;
        else done++;
      }
    } finally {
      this.actions.endGroup();
    }
    this.table.clearSelection();
    undoableNotice(
      skipped === 0 ? `${done} tasques actualitzades` : `${done} actualitzades, ${skipped} omeses`,
      this.actions
    );
  }

  /* ── controls ──────────────────────────────────────────── */

  private setLens(group: GroupKey): void {
    if (this.query.group === group) return;
    this.applyFilter({ group });
  }

  /** Clicking the column that is already sorting turns it around. */
  private sortBy(sort: SortKey): void {
    if (this.query.sort === sort) this.applyFilter({ sortReverse: !this.query.sortReverse });
    else this.applyFilter({ sort, sortReverse: false });
  }

  private toggleGroup(key: string): void {
    if (this.collapsed.has(key)) this.collapsed.delete(key);
    else this.collapsed.add(key);
    this.refresh();
  }

  private dateMenu(task: Task, event: MouseEvent): void {
    openDateMenu(this.actions, task, event, {
      onDrop: async (dropped) => {
        await this.actions.cancel(dropped);
      },
      onOpen: (opened) => void this.openTask(opened),
      onDone: () => this.refresh(),
    });
  }

  private savedViewsMenu(event: MouseEvent): void {
    const menu = new Menu();
    if (this.settings.savedViews.length === 0) {
      menu.addItem((item) => item.setTitle("Cap vista desada").setDisabled(true));
    }
    for (const view of this.settings.savedViews) {
      menu.addItem((item) =>
        item
          .setTitle(view.name)
          .setIcon("bookmark")
          .onClick(() => {
            // Merged over the defaults: a view saved by an older version has no `sortReverse`.
            this.query = { ...DEFAULT_QUERY, ...view.query };
            this.refresh();
          })
      );
    }
    menu.addSeparator();
    menu.addItem((item) =>
      item
        .setTitle("Desar els filtres actuals…")
        .setIcon("save")
        .onClick(() => void this.saveCurrentView())
    );
    if (this.settings.savedViews.length > 0) {
      menu.addItem((item) =>
        item
          .setTitle("Esborrar una vista…")
          .setIcon("trash-2")
          .onClick(() => void this.deleteView())
      );
    }
    menu.showAtMouseEvent(event);
  }

  private async saveCurrentView(): Promise<void> {
    const name = await PromptModal.ask(this.app, "Nom de la vista", "");
    if (!name) return;

    const existing = this.settings.savedViews.findIndex((view) => view.name === name);
    const entry = { name, query: { ...this.query } };
    if (existing >= 0) this.settings.savedViews[existing] = entry;
    else this.settings.savedViews.push(entry);

    await this.persist();
    new Notice(`Vista "${name}" desada`);
  }

  private async deleteView(): Promise<void> {
    const name = await PromptModal.ask(this.app, "Quina vista vols esborrar?", this.settings.savedViews[0]!.name);
    if (!name) return;
    const index = this.settings.savedViews.findIndex((view) => view.name === name);
    if (index < 0) {
      new Notice(`No hi ha cap vista "${name}"`);
      return;
    }
    this.settings.savedViews.splice(index, 1);
    await this.persist();
    new Notice(`Vista "${name}" esborrada`);
  }

  /* ── keyboard ──────────────────────────────────────────── */

  private onKey(event: KeyboardEvent): void {
    const rows = Array.from(this.tableHost.querySelectorAll<HTMLElement>(".tcc-tr"));
    if (rows.length === 0) return;
    const current = rows.indexOf(document.activeElement as HTMLElement);

    const move = (delta: number): void => {
      rows[Math.max(0, Math.min(rows.length - 1, current + delta))]?.focus();
      event.preventDefault();
    };

    switch (event.key) {
      case "j":
      case "ArrowDown":
        return move(current < 0 ? 0 : 1);
      case "k":
      case "ArrowUp":
        return move(current < 0 ? 0 : -1);
      case "/":
        this.searchInput.focus();
        event.preventDefault();
        return;
    }

    if (current < 0) return;
    const task = this.taskAt(rows[current]!);
    if (!task) return;

    switch (event.key) {
      case " ":
        this.table.toggleSelected(task);
        this.refresh();
        break;
      case "a":
        void this.actions.today(task);
        break;
      case "d":
        // Discarding lives inside this menu, on purpose: there is no bare key for it.
        rows[current]!.querySelector<HTMLElement>('[data-act="date"]')?.click();
        break;
      case "x":
      case "Enter":
        void this.actions.complete(task);
        break;
      case "o":
        void this.openTask(task);
        break;
      default:
        return;
    }
    event.preventDefault();
  }

  private taskAt(row: HTMLElement): Task | null {
    const key = row.dataset.tccKey;
    if (!key) return null;
    const split = key.lastIndexOf(":");
    const path = key.slice(0, split);
    const line = Number(key.slice(split + 1));
    return this.index.all().find((t) => t.location.path === path && t.location.line === line) ?? null;
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
