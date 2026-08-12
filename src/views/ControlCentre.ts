import { Menu, Notice, TFile, setIcon, setTooltip, type WorkspaceLeaf } from "obsidian";
import type { TaskIndex } from "../index/TaskIndex";
import type { TaskActions } from "../tasks/TaskActions";
import type { TaskSmithSettings } from "../settings/Config";
import type { Task } from "../types/task";
import { BaseTaskView } from "./BaseTaskView";
import { ConfirmModal } from "./ConfirmModal";
import { PromptModal } from "./PromptModal";
import { undoableNotice } from "./UndoNotice";
import { ControlTable, idOf } from "./ControlTable";
import { openDateMenu, nextFriday } from "./DateMenu";
import { PickModal } from "./PickModal";
import { dayLabel, decimal, monthLabel, shortDate, weekdayLabel } from "./format";
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
  monthlyFlow,
  openState,
  todayProgress,
  weekAhead,
  type ClosingState,
  type DayLoad,
  type MonthlyFlow,
  type OpenState,
  type TodayProgress,
  type WeekAhead,
} from "../query/Metrics";
import { healthFindings, type Finding } from "../query/Health";
import { startOfToday } from "../index/dates";
import { t, tn } from "../i18n/strings";

/** Still `-triage`: the tab grew into a control centre, but the stored id is API for saved layouts. */
export const CONTROL_CENTRE_VIEW = "task-smith-triage";

type Lens = { key: GroupKey; label: string };

const LENSES: Lens[] = [
  { key: "bucket", label: t("lens.bucket") },
  { key: "person", label: t("lens.person") },
  { key: "area", label: t("lens.area") },
];

const SORT_LABELS: Record<SortKey, string> = {
  date: t("sort.date"),
  age: t("sort.age"),
  text: t("sort.text"),
  person: t("sort.person"),
  area: t("sort.area"),
  note: t("sort.note"),
  priority: t("sort.priority"),
};

/** How many months of history fit the chart without the bars turning into hairs. */
const CHART_MONTHS = 8;

/** Tallest bar, in pixels. These are sparklines, not charts you read values off. */
const BAR_HEIGHT = 42;

/** Days in the week strip. Rolling from today, so a Thursday still shows a full week. */
const WEEK_DAYS = 7;

/** Tallest day bar. Shorter than the monthly ones: this strip is read at a glance, daily. */
const DAY_BAR_HEIGHT = 26;


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
  private weekHost!: HTMLElement;
  private historyToggle!: HTMLElement;
  private historyHost!: HTMLElement;
  private searchInput!: HTMLInputElement;
  private chipHost!: HTMLElement;
  private summaryEl!: HTMLElement;
  private tableHost!: HTMLElement;
  private layoutEl!: HTMLElement;
  private healthHost!: HTMLElement;
  private healthToggle!: HTMLElement;
  private healthBody!: HTMLElement;
  /** Last known layout, so a resize only repaints when it crosses the breakpoint. */
  private stacked = false;
  private footerHost!: HTMLElement;

  constructor(
    leaf: WorkspaceLeaf,
    index: TaskIndex,
    actions: TaskActions,
    settings: TaskSmithSettings,
    private readonly openFocus: () => void,
    private readonly persist: () => Promise<void>
  ) {
    super(leaf, index, actions, settings);
    this.table = new ControlTable({
      onSort: (sort) => this.sortBy(sort),
      onToday: (task) => void this.actions.today(task),
      onTomorrow: (task) => void this.actions.tomorrow(task),
      onComplete: (task) => void this.actions.complete(task),
      onReopen: (task) => void this.actions.reopen(task),
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
    return t("controlCentre.title");
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
    views.setAttribute("aria-label", t("savedViews.tooltip"));
    setTooltip(views, t("savedViews.tooltip"), { delay: 300 });
    views.addEventListener("click", (event) => this.savedViewsMenu(event));

    // A real button, because this one really is a button: it takes you to the dock to decide
    // the day. Obsidian's own styling is what it should look like.
    const plan = tools.createEl("button", { cls: "tcc-plan", text: t("controlCentre.planDay") });
    setTooltip(plan, t("controlCentre.planDayTooltip"), { delay: 300 });
    plan.addEventListener("click", () => this.openFocus());

    this.kpiHost = root.createDiv({ cls: "tcc-kpis" });
    this.weekHost = root.createDiv({ cls: "tcc-week" });

    // The history is one click away and stays there: the throughput of past months is worth
    // looking at now and then, never worth looking at while deciding what to do this afternoon.
    const history = root.createDiv({ cls: "tcc-history" });
    this.historyToggle = history.createDiv({ cls: "tcc-history-toggle" });
    this.historyToggle.setAttribute("role", "button");
    this.historyToggle.tabIndex = 0;
    this.historyToggle.addEventListener("click", () => void this.toggleHistory());
    this.historyToggle.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      void this.toggleHistory();
    });
    this.historyHost = history.createDiv({ cls: "tcc-history-body" });

    const filters = root.createDiv({ cls: "tcc-filters" });
    this.searchInput = filters.createEl("input", { cls: "tcc-search", type: "search" });
    this.searchInput.placeholder = t("controlCentre.search");
    this.searchInput.addEventListener("input", () => {
      this.query = { ...this.query, text: this.searchInput.value };
      this.refresh();
    });
    this.chipHost = filters.createDiv({ cls: "tcc-chips" });
    this.summaryEl = filters.createSpan({ cls: "tcc-summary" });

    const layout = root.createDiv({ cls: "tcc-layout" });
    this.layoutEl = layout;
    this.tableHost = layout.createDiv({ cls: "tcc-table" });
    this.tableHost.addEventListener("keydown", (event) => this.onKey(event));

    // Foldable, like the history: as the right-hand rail it is a companion to the table, but
    // stacked under it on a narrow tab it is a wall between you and nothing at all.
    this.healthHost = layout.createDiv({ cls: "tcc-health" });
    this.healthToggle = this.healthHost.createDiv({ cls: "tcc-health-toggle" });
    this.healthToggle.setAttribute("role", "button");
    this.healthToggle.tabIndex = 0;
    this.healthToggle.addEventListener("click", () => void this.toggleHealth());
    this.healthToggle.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      void this.toggleHealth();
    });
    this.healthBody = this.healthHost.createDiv({ cls: "tcc-health-body" });

    this.footerHost = root.createDiv({ cls: "tcc-footer" });
  }

  /**
   * Placeholder blocks in the exact shapes the KPIs and table rows take, so the real paint
   * lands in a layout that already looks like this one instead of jumping from "0 of
   * everything" straight to the true count, which read as a flicker rather than a load.
   */
  protected paintLoading(): void {
    this.kpiHost.empty();
    for (let i = 0; i < 5; i++) {
      const cell = this.kpiHost.createDiv({ cls: "tcc-kpi" });
      cell.createDiv({ cls: "tcc-skel-value" });
      cell.createDiv({ cls: "tcc-skel-label" });
    }

    this.tableHost.empty();
    // A wrapper, not attributes on `tableHost` itself: the next real paint only empties this
    // host's children, so `aria-busy` set on the host would outlive the skeleton it describes.
    const wrap = this.tableHost.createDiv({ attr: { "aria-busy": "true", "aria-label": t("table.loading") } });
    const widths = [70, 45, 85, 55];
    for (const width of widths) {
      const row = wrap.createDiv({ cls: "tcc-skel-row" });
      row.createDiv({ cls: "tcc-skel-box" });
      const text = row.createDiv({ cls: "tcc-skel-text" });
      text.style.maxWidth = `${width}%`;
    }
  }

  protected paint(groups: TaskGroup[], today: Date): void {
    const all = this.index.all();
    // Measured once per paint and handed down: the strip, the chart and the summary line all
    // describe the same vault, and computing it three times invites them to disagree.
    const open = openState(all, today);
    const closings = closingState(all, today);
    const progress = todayProgress(all, today);

    for (const [key, tab] of this.tabs) tab.toggleClass("tcf-tab-on", this.query.group === key);

    this.renderKpis(open, progress);
    this.renderWeek(
      weekAhead(all, today, { span: WEEK_DAYS, weekends: this.settings.showWeekends }),
      closings,
      today
    );
    this.renderHistory(all, closings, today);
    this.renderChips(all, today);
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

  private renderKpis(open: OpenState, progress: TodayProgress): void {
    this.kpiHost.empty();

    this.kpi({
      value: String(open.open),
      label: t("kpi.open.label"),
      detail: tn("kpi.openNotes", open.notes),
      filter: { statusScope: "open", buckets: null, staleOnly: false },
    });

    this.kpi({
      value: String(open.renegotiate),
      label: t("kpi.renegotiate.label"),
      detail:
        open.oldestOverdueDays === null
          ? t("kpi.renegotiate.none")
          : t("kpi.renegotiate.oldest", { days: open.oldestOverdueDays }),
      late: true,
      filter: { statusScope: "open", buckets: ["overdue"], sort: "age", sortReverse: false },
    });

    this.kpi({
      value: String(open.undated),
      label: t("kpi.undated.label"),
      detail:
        open.datableFromNote > 0
          ? t("kpi.undated.withNoteDate", { count: open.datableFromNote })
          : t("kpi.undated.none"),
      filter: { statusScope: "open", buckets: ["undated"] },
    });

    /*
     * The day's own tally, next to the vault-wide counts above: what is still left today, and
     * what already got done today. Pending first, because that is the number worth acting on;
     * closed is the progress reading beside it.
     */
    this.kpi({
      value: String(progress.pending),
      label: t("kpi.pendingToday.label"),
      detail: progress.closed === 0 ? t("kpi.pendingToday.noneClosed") : tn("kpi.closedToday", progress.closed),
      filter: { statusScope: "open", buckets: ["today"], sort: "date", sortReverse: false },
    });

    this.kpi({
      value: String(progress.closed),
      label: t("kpi.closedToday.label"),
      detail:
        progress.pending > 0
          ? tn("kpi.pendingLeft", progress.pending)
          : progress.closed > 0
            ? t("kpi.dayDone")
            : t("kpi.noTasksToday"),
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
    setTooltip(cell, t("kpi.filterTooltip", { label: spec.label }), { delay: 400 });
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

  /* ── the week ahead ────────────────────────────────────── */

  /**
   * What is already promised for each of the next seven days.
   *
   * The one number on this page that is about the future rather than the state of things, and
   * the reason it sits where the throughput chart used to: the question "how is Thursday looking"
   * comes up every morning, "how did March go" comes up twice a year.
   *
   * Days over the measured capacity are marked, because that is the whole point — six tasks on a
   * day that closes two and a half is not a plan, it is three tasks that will become overdue.
   */
  private renderWeek(week: WeekAhead, closings: ClosingState, today: Date): void {
    this.weekHost.empty();

    const capacity = closings.perWorkingDay;
    const scale = Math.max(1, week.peak);

    if (week.overdue > 0) {
      this.weekAside({
        value: String(week.overdue),
        label: t("week.overdue.label"),
        late: true,
        tooltip: t("week.overdue.tooltip"),
        filter: { statusScope: "open", buckets: ["overdue"], sort: "age", sortReverse: false },
      });
    }

    const days = this.weekHost.createDiv({ cls: "tcc-week-days" });
    for (const day of week.days) this.renderDay(days, day, scale, capacity, today);

    this.weekAside({
      value: String(week.later),
      label: t("week.later.label"),
      tooltip: t("week.later.tooltip"),
      filter: { statusScope: "open", buckets: ["later"] },
    });
    this.weekAside({
      value: String(week.undated),
      label: t("kpi.undated.label"),
      tooltip: t("week.undated.tooltip"),
      filter: { statusScope: "open", buckets: ["undated"] },
    });

    const caption = this.weekHost.createDiv({ cls: "tcc-chart-note" });
    caption.appendText(this.weekSentence(week, capacity, today));
  }

  private renderDay(host: HTMLElement, day: DayLoad, scale: number, capacity: number | null, today: Date): void {
    const column = host.createDiv({ cls: "tcc-day" });
    if (day.today) column.addClass("tcc-day-now");
    if (day.weekend) column.addClass("tcc-day-weekend");
    column.setAttribute("role", "button");
    column.tabIndex = 0;

    const over = capacity !== null && day.count > Math.ceil(capacity);
    column.createSpan({ cls: "tcc-day-count", text: day.count === 0 ? "·" : String(day.count) });
    const height = 2 + Math.round((day.count / scale) * DAY_BAR_HEIGHT);
    const bar = column.createDiv({ cls: "tcc-day-bar" });
    bar.style.height = `${height}px`;
    if (over) bar.addClass("tcc-day-over");
    // The part of a Monday that is really the weekend, drawn as its own segment at the foot of
    // the bar. The tooltip says it in words; without the segment the column is a Monday that
    // looks busier than Mondays are, with nothing on screen to suggest asking why.
    if (day.absorbed > 0) {
      const folded = bar.createDiv({ cls: "tcc-day-bar-folded" });
      folded.style.height = `${Math.max(2, Math.round((day.absorbed / day.count) * height))}px`;
    }
    column.createSpan({ cls: "tcc-day-label", text: day.today ? t("day.today") : weekdayLabel(day.date) });
    column.createSpan({ cls: "tcc-day-num", text: String(day.date.getDate()) });

    setTooltip(column, this.dayTooltip(day, capacity, today), { delay: 200 });
    // `day.days`, not `day.iso`: a Monday carrying a hidden weekend opens the three days it
    // counted, so the number on the column and the rows behind it are the same tasks.
    const apply = (): void =>
      this.applyFilter({ statusScope: "open", buckets: null, dueOn: day.days, sort: "date", sortReverse: false });
    column.addEventListener("click", apply);
    column.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      apply();
    });
  }

  private dayTooltip(day: DayLoad, capacity: number | null, today: Date): string {
    const name = dayLabel(day.date, today);
    const own = day.count - day.absorbed;
    const parts = [
      day.count === 0
        ? t("day.none", { name })
        : tn("day.count", day.count, { name, date: shortDate(day.date) }),
    ];
    // A folded weekend has to say so on the column that swallowed it, or the Monday reads as a
    // Monday that promised more than it did.
    if (day.absorbed > 0) {
      parts.push(tn("day.absorbed", own, { own, absorbed: day.absorbed }));
    } else if (day.days.length > 1) {
      parts.push(t("day.includesWeekend"));
    }
    if (capacity !== null && day.count > Math.ceil(capacity)) {
      parts.push(t("day.aboveCapacity", { capacity: decimal(capacity) }));
    }
    if (day.weekend && day.count > 0) parts.push(t("day.weekend"));
    return parts.join("\n");
  }

  /** The sentence under the strip: the load, and whether the week as a whole fits. */
  private weekSentence(week: WeekAhead, capacity: number | null, today: Date): string {
    if (week.planned === 0) {
      return week.undated > 0
        ? t("week.noneDated.withUndated", { count: week.undated })
        : t("week.noneDated");
    }

    const busiest = [...week.days].sort((a, b) => b.count - a.count)[0]!;
    // Seven columns are seven calendar days or seven working ones, and the sentence has to say
    // which: with the weekend folded away the strip reaches nine or ten days into the future.
    const ahead = this.settings.showWeekends
      ? t("week.ahead.calendar", { count: week.days.length })
      : t("week.ahead.working", { count: week.days.length });
    const head = tn("week.summary", week.planned, {
      ahead,
      busiest: busiest.count,
      day: dayLabel(busiest.date, today),
    });
    if (capacity === null) return head;

    // Working days only: nobody closes tasks on Sunday, and counting them would say the week
    // fits when it does not.
    const workload = week.days.filter((day) => !day.weekend).reduce((sum, day) => sum + day.count, 0);
    const room = capacity * week.days.filter((day) => !day.weekend).length;
    const verdict =
      workload > room
        ? t("week.verdict.over", { workload, room: Math.round(room) })
        : t("week.verdict.under", { workload, capacity: decimal(capacity) });
    return head + verdict;
  }

  private weekAside(spec: {
    value: string;
    label: string;
    tooltip: string;
    late?: boolean;
    filter: Partial<QueryState>;
  }): void {
    const cell = this.weekHost.createDiv({ cls: "tcc-week-aside" });
    cell.setAttribute("role", "button");
    cell.tabIndex = 0;
    setTooltip(cell, spec.tooltip, { delay: 300 });
    const value = cell.createSpan({ cls: "tcc-week-aside-value", text: spec.value });
    if (spec.late) value.addClass("tcc-late");
    cell.createSpan({ cls: "tcc-week-aside-label", text: spec.label });

    const apply = (): void => this.applyFilter(spec.filter);
    cell.addEventListener("click", apply);
    cell.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      apply();
    });
  }

  /* ── the history, folded away ──────────────────────────── */

  private async toggleHistory(): Promise<void> {
    this.settings.showHistory = !this.settings.showHistory;
    this.refresh();
    await this.persist();
  }

  /**
   * Created against closed, per month. Two series and not one because the number that explains
   * a growing backlog is the difference: months where the first bar beats the second are months
   * the list got longer, whatever the throughput looked like on its own.
   *
   * "Created" is the task's origin date — its `➕` when it has one, else the date of the note it
   * lives in. The caption says so, because it is an approximation and a chart that hides its
   * approximations is a chart you will over-read.
   */
  private renderHistory(all: Task[], closings: ClosingState, today: Date): void {
    const open = this.settings.showHistory;

    this.historyToggle.empty();
    setIcon(this.historyToggle.createSpan({ cls: "tcc-history-chevron" }), open ? "chevron-down" : "chevron-right");
    this.historyToggle.createSpan({ cls: "tcc-history-title", text: t("history.title") });
    this.historyToggle.createSpan({
      cls: "tcc-history-hint",
      text: open ? t("history.hintOpen") : t("history.hintClosed", { count: CHART_MONTHS }),
    });
    this.historyToggle.setAttribute("aria-expanded", String(open));

    this.historyHost.empty();
    this.historyHost.toggleClass("tcc-history-open", open);
    if (!open) return;

    const months = monthlyFlow(all, today, CHART_MONTHS);
    const peak = Math.max(1, ...months.map((month) => Math.max(month.created, month.closed)));

    const chart = this.historyHost.createDiv({ cls: "tcc-flow" });
    const bars = chart.createDiv({ cls: "tcc-bars" });
    for (const month of months) {
      const column = bars.createDiv({ cls: "tcc-flow-col" });
      const pair = column.createDiv({ cls: "tcc-flow-pair" });
      // Pixels, not percentages: a percentage height inside a flex column resolves against a
      // box whose height the labels also share, and the tall months would overflow the strip.
      this.flowBar(pair, month.created, peak, "tcc-flow-created", month.current);
      this.flowBar(pair, month.closed, peak, "tcc-flow-closed", month.current);
      column.createSpan({ cls: "tcc-bar-month", text: monthLabel(month.year, month.month, today) });
      setTooltip(column, this.monthTooltip(month, today), { delay: 200 });
    }

    const legend = chart.createDiv({ cls: "tcc-flow-legend" });
    for (const [cls, label] of [
      ["tcc-flow-created", t("history.legendCreated")],
      ["tcc-flow-closed", t("history.legendClosed")],
    ]) {
      const item = legend.createSpan({ cls: "tcc-flow-key" });
      item.createSpan({ cls: `tcc-flow-swatch ${cls}` });
      item.appendText(label!);
    }

    this.renderHistoryNote(chart, months, closings);
  }

  private flowBar(host: HTMLElement, value: number, peak: number, cls: string, current: boolean): void {
    const bar = host.createDiv({ cls: `tcc-flow-bar ${cls}` });
    bar.style.height = `${2 + Math.round((value / peak) * BAR_HEIGHT)}px`;
    if (current) bar.addClass("tcc-bar-now");
  }

  private renderHistoryNote(host: HTMLElement, months: MonthlyFlow[], closings: ClosingState): void {
    const created = months.reduce((sum, month) => sum + month.created, 0);
    const closed = months.reduce((sum, month) => sum + month.closed, 0);
    const stillOpen = months.reduce((sum, month) => sum + month.stillOpen, 0);

    const note = host.createDiv({ cls: "tcc-chart-note tcc-history-note" });
    note.appendText(t("history.note.intro", { count: months.length }));
    note.createEl("b", { text: t("history.note.counts", { created, closed }) });
    if (created > 0) {
      const ratio = Math.round((closed / created) * 100);
      const drift = created - closed;
      note.appendText(
        drift > 0
          ? t("history.note.grew", { ratio, drift, stillOpen })
          : t("history.note.shrank", { ratio })
      );
    } else {
      note.appendText(".");
    }

    if (closings.perWorkingDay !== null) {
      note.appendText(t("history.note.average", { average: decimal(closings.perWorkingDay) }));
    }
    note.appendText(t("history.note.footnote"));
  }

  private monthTooltip(month: MonthlyFlow, today: Date): string {
    const name = monthLabel(month.year, month.month, today);
    const parts = [t("history.month.tooltip", { name, created: month.created, closed: month.closed })];
    if (month.cancelled > 0) parts.push(t("history.month.doneCancelled", { done: month.done, cancelled: month.cancelled }));
    if (month.stillOpen > 0) parts.push(t("history.month.stillOpen", { count: month.stillOpen }));
    if (month.current) parts.push(t("history.month.current"));
    return parts.join("\n");
  }

  /* ── the filter sentence ───────────────────────────────── */

  private chipContext(all: Task[], today: Date): ChipContext {
    const kinds = countByKind(all);
    return {
      staleThresholdDays: this.settings.staleThresholdDays,
      today,
      referenceLines: kinds.reference,
      somedayLines: kinds.someday,
    };
  }

  private renderChips(all: Task[], today: Date): void {
    const ctx = this.chipContext(all, today);
    this.chipHost.empty();

    for (const chip of describeFilters(this.query, ctx)) {
      const el = this.chipHost.createSpan({ cls: "tcc-chip" });
      el.createSpan({ text: chip.label });
      const clear = el.createSpan({ cls: "tcc-chip-x", text: "×" });
      clear.setAttribute("role", "button");
      clear.setAttribute("aria-label", t("chip.remove", { label: chip.label }));
      clear.addEventListener("click", () => this.applyFilter(chip.clear));
    }

    const add = this.chipHost.createSpan({ cls: "tcc-chip tcc-chip-add", text: t("chip.add") });
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

    this.pickFilter(menu, t("filter.project"), () => this.projects(), (value) => ({ project: value, area: null }));
    this.pickFilter(menu, t("filter.area"), () => this.areas(), (value) => ({ area: value, project: null }));
    this.pickFilter(menu, t("filter.person"), () => this.people(), (value) => ({ person: value }));

    menu.addSeparator();
    menu.addItem((item) =>
      item
        .setTitle(t("menu.clearAllFilters"))
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
        .setTitle(t("filter.ellipsis", { label }))
        .setIcon("filter")
        .onClick(async () => {
          const options = values();
          if (options.length === 0) {
            new Notice(t("notice.noneOfType", { type: label.toLowerCase() }));
            return;
          }
          const chosen = await PickModal.ask(this.app, t("filter.ellipsis", { label }), options);
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
    const what = scope === "open" ? t("summary.open") : scope === "closed" ? t("summary.closed") : t("summary.lines");
    const order = SORT_LABELS[this.query.sort];
    const direction = this.query.sortReverse ? " ↑" : "";
    this.summaryEl.setText(t("summary.line", { shown, total, what, order, direction }));
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

    this.stacked = this.isStacked();
    const open = this.healthOpen();
    const worth = findings.filter((finding) => finding.tone === "warn").length;
    const worthPhrase = worth === 0 ? t("health.nothingToFix") : tn("health.itemsToCheck", worth);

    this.healthToggle.empty();
    setIcon(
      this.healthToggle.createSpan({ cls: "tcc-health-chevron" }),
      open ? "chevron-down" : "chevron-right"
    );
    this.healthToggle.createSpan({ cls: "tcc-health-title", text: t("health.title") });
    this.healthToggle.setAttribute("aria-expanded", String(open));
    // The sentence used to live on the toggle itself while folded, but that's what made a
    // folded panel almost as wide as an open one. The tooltip can afford to spell it out; the
    // toggle — which has to stay put, not grow, so the table keeps the width it gives back —
    // can't.
    setTooltip(
      this.healthToggle,
      open ? t("health.collapseTooltip") : t("health.expandTooltip", { worthPhrase }),
      { delay: 300 }
    );

    this.healthHost.toggleClass("tcc-health-shut", !open);
    // Open, it belongs beside the table — a child of the layout row, taking its 250px.
    // Folded, it has no business in that row at all: staying there is what kept costing the
    // table width no matter how short the label got. Moved above the row instead (like the
    // history toggle) it costs one row of height, not a column — and styled flush right (see
    // `.tcc-health-shut` in styles.css) it lands almost exactly above where the rail would
    // start, so opening it feels like it drops down in place rather than jumping across the tab.
    if (open) {
      this.layoutEl.appendChild(this.healthHost);
    } else {
      this.layoutEl.parentElement?.insertBefore(this.healthHost, this.layoutEl);
    }
    this.healthBody.empty();
    if (!open) return;

    if (findings.length === 0) {
      this.healthBody.createDiv({ cls: "tcc-health-detail", text: t("health.nothingBody") });
      return;
    }
    for (const finding of findings) this.renderFinding(finding);
  }

  /**
   * Whether the panel is a block under the table rather than the right-hand rail.
   *
   * Asked of the stylesheet rather than measured against a copy of the breakpoint: the container
   * query in `styles.css` is what actually decides, and a second 780 in here would be one edit
   * away from disagreeing with it. Anything but `column` — including an unstyled or detached
   * element — reads as the rail, which is the state that hides nothing.
   */
  private isStacked(): boolean {
    if (!this.layoutEl) return false;
    return window.getComputedStyle(this.layoutEl).flexDirection === "column";
  }

  private healthOpen(): boolean {
    const setting = this.settings.healthPanel;
    if (setting === "open") return true;
    if (setting === "closed") return false;
    return !this.stacked;
  }

  /**
   * Folding it is a decision, and it outranks the width rule from then on: someone who folds the
   * rail on a wide tab means it, and so does someone who opens it on a narrow one.
   */
  private async toggleHealth(): Promise<void> {
    this.settings.healthPanel = this.healthOpen() ? "closed" : "open";
    this.refresh();
    await this.persist();
  }

  /** Obsidian calls this when the pane is resized; only a crossed breakpoint is worth a repaint. */
  onResize(): void {
    const stacked = this.isStacked();
    if (stacked === this.stacked) return;
    this.stacked = stacked;
    if (this.settings.healthPanel === "auto") this.refresh();
  }

  private renderFinding(finding: Finding): void {
    const item = this.healthBody.createDiv({ cls: "tcc-finding" });
    if (finding.tone === "ok") item.addClass("tcc-finding-ok");
    item.createDiv({ cls: "tcc-finding-title", text: finding.title });
    item.createDiv({ cls: "tcc-finding-detail", text: finding.detail });
    if (!finding.action) return;

    const action = item.createSpan({ cls: "tcc-finding-action", text: finding.action });
    action.setAttribute("role", "button");
    action.tabIndex = 0;
    const run = (): void => {
      if (finding.filter) this.applyFilter(finding.filter);
    };
    action.addEventListener("click", run);
    action.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      run();
    });
  }

  /* ── the footer: selection, or the keys ────────────────── */

  private renderFooter(): void {
    const selected = this.table.selectedFrom(this.index.all());
    this.footerHost.empty();

    if (selected.length === 0) {
      const keys = this.footerHost.createDiv({ cls: "tcf-keys" });
      for (const [key, what] of [
        ["J K", t("footer.key.move")],
        [t("footer.key.selectCombo"), t("footer.key.select")],
        ["A", t("footer.key.today")],
        ["D", t("footer.key.date")],
        ["X", t("footer.key.done")],
        ["O", t("footer.key.open")],
        ["/", t("footer.key.search")],
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
      text: tn("footer.selectedCount", selected.length),
    });

    const actions: [string, () => Promise<void>][] = [
      [t("action.today"), () => this.bulk(selected, (task) => this.actions.today(task), t("action.today"))],
      [t("dateMenu.tomorrow"), () => this.bulk(selected, (task) => this.actions.tomorrow(task), t("dateMenu.tomorrow"))],
      [
        t("dateMenu.friday"),
        () => this.bulk(selected, (task) => this.actions.scheduleOn(task, nextFriday(startOfToday())), t("dateMenu.friday")),
      ],
      [t("dateMenu.plusWeek"), () => this.bulk(selected, (task) => this.actions.nextWeek(task), t("dateMenu.plusWeek"))],
      [t("dateMenu.clearDate"), () => this.bulk(selected, (task) => this.actions.clearDue(task), t("dateMenu.clearDate"))],
    ];
    for (const [label, run] of actions) {
      const word = bar.createSpan({ cls: "tcc-act", text: label });
      word.setAttribute("role", "button");
      word.addEventListener("click", () => void run());
    }

    // Cancelling and deleting sit apart from the reschedules, and read as warnings.
    const cancel = bar.createSpan({ cls: "tcc-act tcc-act-warn", text: t("dateMenu.wontDo") });
    cancel.setAttribute("role", "button");
    cancel.addEventListener("click", () => void this.bulkCancel(selected));

    const remove = bar.createSpan({ cls: "tcc-act tcc-act-warn", text: t("button.delete") });
    remove.setAttribute("role", "button");
    remove.addEventListener("click", () => void this.bulkDelete(selected));

    const clear = bar.createSpan({ cls: "tcc-act tcc-bulk-clear", text: t("action.clearSelection") });
    clear.setAttribute("role", "button");
    clear.addEventListener("click", () => this.table.clearSelection());
  }

  private async bulkCancel(tasks: Task[]): Promise<void> {
    const confirmed = await ConfirmModal.ask(
      this.app,
      t("modal.cancelTasks.title"),
      t("modal.cancelTasks.body", { count: tasks.length }),
      t("modal.cancelTasks.confirm", { count: tasks.length })
    );
    if (!confirmed) return;
    await this.bulk(tasks, (task) => this.actions.cancel(task), t("button.cancel"));
  }

  /** Deleting several lines at once still asks first, even though it can now be undone. */
  private async bulkDelete(tasks: Task[]): Promise<void> {
    const confirmed = await ConfirmModal.ask(
      this.app,
      t("modal.deleteTasks.title"),
      t("modal.deleteTasks.body", { count: tasks.length, undo: t("button.undo") }),
      t("modal.deleteTasks.confirm", { count: tasks.length })
    );
    if (!confirmed) return;

    const { deleted, skipped } = await this.actions.removeMany(tasks);
    this.table.clearSelection();
    undoableNotice(
      skipped === 0 ? tn("notice.tasksDeleted", deleted) : t("notice.tasksDeletedWithSkipped", { deleted, skipped }),
      this.actions
    );
  }

  /**
   * Sequential on purpose: each write re-reads the file, so parallel edits would conflict.
   * The whole batch is one history entry, so undoing a bulk action is one step and not twenty.
   */
  private async bulk(tasks: Task[], run: (task: Task) => Promise<unknown>, label: string): Promise<void> {
    this.actions.beginGroup(t("group.label", { label, count: tasks.length }));
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
      skipped === 0 ? tn("notice.tasksUpdated", done) : t("notice.tasksUpdatedWithSkipped", { done, skipped }),
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
    openDateMenu(this.app, this.actions, task, event, {
      onDrop: async (dropped) => {
        await this.actions.cancel(dropped);
      },
      onOpen: (opened) => void this.openTask(opened),
      // The control centre has no notion of "today's three" — that lives in the sidebar's
      // `DaySelection` — so there is no slot here to give up.
      onReschedule: () => {},
      onDone: () => this.refresh(),
    });
  }

  private savedViewsMenu(event: MouseEvent): void {
    const menu = new Menu();
    if (this.settings.savedViews.length === 0) {
      menu.addItem((item) => item.setTitle(t("menu.noSavedViews")).setDisabled(true));
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
        .setTitle(t("menu.saveCurrentFilters"))
        .setIcon("save")
        .onClick(() => void this.saveCurrentView())
    );
    if (this.settings.savedViews.length > 0) {
      menu.addItem((item) =>
        item
          .setTitle(t("menu.deleteView"))
          .setIcon("trash-2")
          .onClick(() => void this.deleteView())
      );
    }
    menu.showAtMouseEvent(event);
  }

  private async saveCurrentView(): Promise<void> {
    const name = await PromptModal.ask(this.app, t("prompt.viewName"), "");
    if (!name) return;

    const existing = this.settings.savedViews.findIndex((view) => view.name === name);
    const entry = { name, query: { ...this.query } };
    if (existing >= 0) this.settings.savedViews[existing] = entry;
    else this.settings.savedViews.push(entry);

    await this.persist();
    new Notice(t("notice.viewSaved", { name }));
  }

  private async deleteView(): Promise<void> {
    const name = await PromptModal.ask(this.app, t("prompt.whichViewToDelete"), this.settings.savedViews[0]!.name);
    if (!name) return;
    const index = this.settings.savedViews.findIndex((view) => view.name === name);
    if (index < 0) {
      new Notice(t("notice.viewNotFound", { name }));
      return;
    }
    this.settings.savedViews.splice(index, 1);
    await this.persist();
    new Notice(t("notice.viewDeleted", { name }));
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
        rows[current]!.querySelector<HTMLElement>('[data-act="more"]')?.click();
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
      new Notice(t("notice.fileNotFound", { path: task.location.path }));
      return;
    }
    const leaf = this.app.workspace.getLeaf(false);
    await leaf.openFile(file, { eState: { line: task.location.line } });
  }
}
