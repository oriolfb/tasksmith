import { type WorkspaceLeaf, setIcon } from "obsidian";
import type { TaskIndex } from "../index/TaskIndex";
import type { TaskActions } from "../tasks/TaskActions";
import type { TaskConsoleSettings } from "../settings/Config";
import { BaseTaskView } from "./BaseTaskView";
import { bucketCounts, filterTasks } from "../query/Query";
import type { QueryState, SortKey } from "../query/Query";
import { DEFAULT_QUERY } from "../query/Query";

export const SIDEBAR_VIEW = "task-console-sidebar";

export class SidebarView extends BaseTaskView {
  private summaryHost!: HTMLElement;

  constructor(leaf: WorkspaceLeaf, index: TaskIndex, actions: TaskActions, settings: TaskConsoleSettings, private readonly openTriage: () => void) {
    super(leaf, index, actions, settings, { wide: false, selectable: false });
  }

  getViewType(): string {
    return SIDEBAR_VIEW;
  }

  getDisplayText(): string {
    return "Tasques";
  }

  getIcon(): string {
    return "list-checks";
  }

  protected build(): void {
    const root = this.containerEl.children[1] as HTMLElement;
    root.empty();
    root.addClass("tc-sidebar");

    const toolbar = root.createDiv({ cls: "tc-toolbar" });

    const search = toolbar.createEl("input", { cls: "tc-search", type: "search" });
    search.placeholder = "Cerca…";
    search.addEventListener("input", () => {
      this.query = { ...this.query, text: search.value };
      this.refresh();
    });

    const controls = root.createDiv({ cls: "tc-controls" });

    const sort = controls.createEl("select", { cls: "dropdown tc-select-small" });
    for (const [value, label] of [
      ["date", "Per data"],
      ["priority", "Per prioritat"],
      ["age", "Per antiguitat"],
      ["note", "Per nota"],
    ] as [SortKey, string][]) {
      sort.createEl("option", { value, text: label });
    }
    sort.addEventListener("change", () => {
      this.query = { ...this.query, sort: sort.value as SortKey };
      this.refresh();
    });

    const reset = controls.createEl("button", { cls: "tc-toggle" });
    setIcon(reset, "filter-x");
    reset.setAttribute("aria-label", "Treure tots els filtres");
    reset.addEventListener("click", () => {
      this.query = { ...DEFAULT_QUERY, sort: this.query.sort };
      search.value = "";
      this.refresh();
    });

    const triage = controls.createEl("button", { cls: "tc-toggle" });
    setIcon(triage, "layout-list");
    triage.setAttribute("aria-label", "Obrir la vista de triatge");
    triage.addEventListener("click", () => this.openTriage());

    this.summaryHost = root.createDiv({ cls: "tc-summary" });
    this.listHost = root.createDiv({ cls: "tc-list" });
  }

  /** The three health rules, each with a live count and a one-click filter. */
  protected afterRefresh(): void {
    const ctx = this.context();
    const all = this.index.all();
    const counts = bucketCounts(all, ctx.today);
    const stale = filterTasks(all, { ...DEFAULT_QUERY, staleOnly: true }, ctx).length;

    interface Pill {
      label: string;
      count: number;
      cls: string;
      apply: QueryState;
      active: boolean;
    }

    const bucketPill = (label: string, bucket: "overdue" | "today" | "week" | "undated", count: number, cls: string): Pill => ({
      label,
      count,
      cls,
      apply: { ...this.query, staleOnly: false, buckets: [bucket] },
      active: !this.query.staleOnly && this.query.buckets?.length === 1 && this.query.buckets[0] === bucket,
    });

    const pills: Pill[] = [
      bucketPill("Endarrerides", "overdue", counts.overdue, "tc-pill-overdue"),
      bucketPill("Avui", "today", counts.today, "tc-pill-today"),
      bucketPill("Setmana", "week", counts.week, ""),
      bucketPill("Sense data", "undated", counts.undated, "tc-pill-undated"),
      {
        label: "Estancades",
        count: stale,
        cls: "tc-pill-stale",
        apply: { ...this.query, buckets: null, staleOnly: true },
        active: this.query.staleOnly,
      },
    ];

    this.summaryHost.empty();
    for (const pill of pills) {
      const el = this.summaryHost.createDiv({ cls: `tc-pill ${pill.cls}`.trim() });
      el.createSpan({ cls: "tc-pill-count", text: String(pill.count) });
      el.createSpan({ cls: "tc-pill-label", text: pill.label });
      el.setAttribute(
        "aria-label",
        pill.label === "Estancades"
          ? `Obertes des de fa ${this.settings.staleThresholdDays} dies o més`
          : `Filtrar per ${pill.label.toLowerCase()}`
      );
      if (pill.active) el.addClass("tc-pill-active");
      el.addEventListener("click", () => {
        this.query = pill.active ? { ...this.query, buckets: null, staleOnly: false } : pill.apply;
        this.refresh();
      });
    }
  }
}
