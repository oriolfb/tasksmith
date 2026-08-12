import { ItemView, type WorkspaceLeaf } from "obsidian";
import type { TaskIndex } from "../index/TaskIndex";
import type { TaskActions } from "../tasks/TaskActions";
import type { TaskSmithSettings } from "../settings/Config";
import { deserializeTaskCache } from "../index/TaskCache";
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
    protected settings: TaskSmithSettings
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

  setSettings(settings: TaskSmithSettings): void {
    this.settings = settings;
    this.refresh();
  }

  /**
   * Lands the view on a specific filter, e.g. handed off from the dock's "N més".
   *
   * Choosing a bucket clears any single-day filter unless the patch names one: the two are
   * answers to the same question, and every caller that sets `buckets` means "show me these",
   * not "these, of the ones already narrowed to Thursday".
   */
  applyFilter(patch: Partial<QueryState>): void {
    const supersedesDay = patch.buckets !== undefined && patch.dueOn === undefined;
    this.query = { ...this.query, ...(supersedesDay ? { dueOn: null } : {}), ...patch };
    this.refresh();
  }

  /** Builds the chrome once; `refresh` only redraws what the data changes. */
  protected abstract build(): void;

  protected abstract paint(groups: TaskGroup[], today: Date): void;

  /**
   * Drawn instead of `paint` for the one refresh that can land before the first full scan
   * finishes. Without this, that refresh sees `index.all()` as `[]` and paints a vault with
   * zero of everything — indistinguishable from one that really is empty.
   */
  protected abstract paintLoading(): void;

  protected context(): QueryContext {
    return {
      today: startOfToday(),
      mtimeOf: (path) => this.index.mtimeOf(path),
      staleThresholdDays: this.settings.staleThresholdDays,
    };
  }

  refresh(): void {
    if (!this.built) return;
    if (!this.index.ready) {
      const cached = deserializeTaskCache(this.settings.taskCache);
      if (!cached) {
        this.paintLoading();
        return;
      }
      // The last full scan, painted until the real one lands. Safe even if the vault moved on
      // while Obsidian was closed: every write re-reads its line from disk first and refuses to
      // touch it if the text has changed (see `TaskWriter`), so a stale row can go stale-looking
      // for a few seconds at worst, never write to the wrong place.
      const ctx = this.context();
      this.paint(runQuery(cached, this.query, ctx), ctx.today);
      return;
    }
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
