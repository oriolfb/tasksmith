import { ItemView, type WorkspaceLeaf } from "obsidian";
import type { TaskIndex } from "../index/TaskIndex";
import type { TaskActions } from "../tasks/TaskActions";
import type { TaskConsoleSettings } from "../settings/Config";
import { DEFAULT_QUERY, type QueryContext, type QueryState, type TaskGroup, runQuery } from "../query/Query";
import { startOfToday } from "../index/dates";

/**
 * The plumbing a query-driven view needs: the query state, the index subscription, a coalesced
 * refresh, and the hand-off filter from the dock's "N més". It knows nothing about how the
 * result is drawn — that is `paint`.
 */
export abstract class BaseTaskView extends ItemView {
  protected query: QueryState = { ...DEFAULT_QUERY };
  private unsubscribe: (() => void) | null = null;
  private queued = false;
  private built = false;

  constructor(
    leaf: WorkspaceLeaf,
    protected readonly index: TaskIndex,
    protected readonly actions: TaskActions,
    protected settings: TaskConsoleSettings
  ) {
    super(leaf);
  }

  async onOpen(): Promise<void> {
    this.unsubscribe = this.index.onChange(() => this.scheduleRefresh());
    this.build();
    this.built = true;
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

  /** Lands the view on a specific filter, e.g. handed off from the dock's "N més". */
  applyFilter(patch: Partial<QueryState>): void {
    this.query = { ...this.query, ...patch };
    this.refresh();
  }

  /** Builds the chrome once; `refresh` only redraws what the data changes. */
  protected abstract build(): void;

  protected abstract paint(groups: TaskGroup[], today: Date): void;

  protected context(): QueryContext {
    return {
      today: startOfToday(),
      mtimeOf: (path) => this.index.mtimeOf(path),
      staleThresholdDays: this.settings.staleThresholdDays,
    };
  }

  refresh(): void {
    if (!this.built) return;
    const ctx = this.context();
    this.paint(runQuery(this.index.all(), this.query, ctx), ctx.today);
  }

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
