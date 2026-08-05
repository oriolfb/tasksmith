import { ItemView, type WorkspaceLeaf } from "obsidian";
import type { TaskIndex } from "../index/TaskIndex";
import type { TaskActions } from "../tasks/TaskActions";
import type { TaskConsoleSettings } from "../settings/Config";
import { DEFAULT_QUERY, type QueryContext, type QueryState, runQuery } from "../query/Query";
import { startOfToday } from "../index/dates";
import { TaskListRenderer, type RendererOptions } from "./TaskListRenderer";

export abstract class BaseTaskView extends ItemView {
  protected query: QueryState = { ...DEFAULT_QUERY };
  protected renderer: TaskListRenderer;
  protected listHost!: HTMLElement;
  private unsubscribe: (() => void) | null = null;
  private queued = false;

  constructor(
    leaf: WorkspaceLeaf,
    protected readonly index: TaskIndex,
    protected readonly actions: TaskActions,
    protected settings: TaskConsoleSettings,
    rendererOptions: RendererOptions
  ) {
    super(leaf);
    this.renderer = new TaskListRenderer(this.app, this.actions, rendererOptions, () => this.onSelectionChange());
  }

  async onOpen(): Promise<void> {
    this.unsubscribe = this.index.onChange(() => this.scheduleRefresh());
    this.build();
    this.refresh();
  }

  async onClose(): Promise<void> {
    this.unsubscribe?.();
    this.unsubscribe = null;
  }

  setSettings(settings: TaskConsoleSettings): void {
    this.settings = settings;
    this.refresh();
  }

  /** Builds the chrome once; `refresh` only rebuilds the list. */
  protected abstract build(): void;

  protected onSelectionChange(): void {}

  protected context(): QueryContext {
    return {
      today: startOfToday(),
      mtimeOf: (path) => this.index.mtimeOf(path),
      staleThresholdDays: this.settings.staleThresholdDays,
    };
  }

  refresh(): void {
    if (!this.listHost) return;
    const ctx = this.context();
    const groups = runQuery(this.index.all(), this.query, ctx);
    this.renderer.render(this.listHost, groups, ctx.today);
    this.afterRefresh();
  }

  protected afterRefresh(): void {}

  /** Coalesces the burst of change events a single file save produces. */
  private scheduleRefresh(): void {
    if (this.queued) return;
    this.queued = true;
    window.setTimeout(() => {
      this.queued = false;
      this.refresh();
    }, 80);
  }
}
