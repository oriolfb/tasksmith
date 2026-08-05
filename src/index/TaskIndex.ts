import type { App, TFile } from "obsidian";
import type { Task } from "../types/task";
import type { TasksInterop } from "../tasks/TasksPluginSettings";
import { ScopeFilter } from "./ScopeFilter";
import { tasksFromFile } from "./buildTasks";
import { DEFAULT_CONTEXT_RULES, type ContextRules } from "./ContextRules";
import { Logger } from "../utils/Logger";

type Listener = () => void;

/**
 * In-memory index of every task in scope. A full scan of this vault is ~900 reads served
 * from Obsidian's own cache, so there is no persisted cache to go stale.
 */
export class TaskIndex {
  private byPath = new Map<string, Task[]>();
  private mtimes = new Map<string, number>();
  private listeners = new Set<Listener>();

  constructor(
    private readonly app: App,
    private scope: ScopeFilter,
    private interop: TasksInterop,
    private rules: ContextRules = DEFAULT_CONTEXT_RULES
  ) {}

  setScope(scope: ScopeFilter): void {
    this.scope = scope;
  }

  setInterop(interop: TasksInterop): void {
    this.interop = interop;
  }

  setContextRules(rules: ContextRules): void {
    this.rules = rules;
  }

  async rebuild(): Promise<void> {
    this.byPath.clear();
    this.mtimes.clear();
    const files = this.app.vault.getMarkdownFiles();
    for (const file of files) {
      await this.load(file, false);
    }
    Logger.info(`indexed ${this.all().length} tasks from ${this.byPath.size} notes`);
    this.emit();
  }

  async reindex(file: TFile): Promise<void> {
    await this.load(file, true);
  }

  remove(path: string): void {
    if (this.byPath.delete(path)) {
      this.mtimes.delete(path);
      this.emit();
    }
  }

  async rename(file: TFile, oldPath: string): Promise<void> {
    this.byPath.delete(oldPath);
    this.mtimes.delete(oldPath);
    await this.load(file, true);
  }

  all(): Task[] {
    const out: Task[] = [];
    for (const tasks of this.byPath.values()) out.push(...tasks);
    return out;
  }

  open(): Task[] {
    return this.all().filter((task) => task.open);
  }

  mtimeOf(path: string): number | null {
    return this.mtimes.get(path) ?? null;
  }

  /** Returns an unsubscribe function. */
  onChange(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private async load(file: TFile, notify: boolean): Promise<void> {
    if (!this.scope.includes(file.path)) {
      if (this.byPath.delete(file.path) && notify) this.emit();
      return;
    }
    try {
      const content = await this.app.vault.cachedRead(file);
      const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter;
      const tasks = tasksFromFile({ path: file.path, content, frontmatter }, this.interop, this.rules);
      if (tasks.length > 0) {
        this.byPath.set(file.path, tasks);
      } else {
        this.byPath.delete(file.path);
      }
      this.mtimes.set(file.path, file.stat.mtime);
    } catch (err) {
      Logger.error(`failed to index ${file.path}`, err);
    }
    if (notify) this.emit();
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }
}
