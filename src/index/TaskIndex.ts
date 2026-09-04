import type { App, TFile } from "obsidian";
import type { Task } from "../types/task";
import type { TasksInterop } from "../tasks/TasksPluginSettings";
import { ScopeFilter } from "./ScopeFilter";
import { tasksFromFile } from "./buildTasks";
import { DEFAULT_CONTEXT_RULES, type ContextRules } from "./ContextRules";
import { peopleOf } from "./NoteContext";
import { Logger } from "../utils/Logger";

type Listener = () => void;

interface ScanResult {
  byPath: Map<string, Task[]>;
  mtimes: Map<string, number>;
  peopleByPath: Map<string, string[]>;
  failures: string[];
}

/**
 * How many notes are read at once during a full scan.
 *
 * Measured on this vault (895 notes, 3.6 MB): one `await` per file costs 2.4 s with the OS
 * cache already warm, the same reads in batches of 32 cost 168 ms, and parsing the lot is 32 ms.
 * The scan was never CPU-bound — it was 895 round-trips taken one at a time.
 */
const READ_BATCH = 32;

/**
 * In-memory index of every task in scope. A full scan of this vault is ~900 reads served
 * from Obsidian's own cache, so there is no persisted cache to go stale.
 */
export class TaskIndex {
  private byPath = new Map<string, Task[]>();
  private mtimes = new Map<string, number>();
  /** Each file's own `Persones:`, kept separately from `Task.people` so a "Nom:" prefix
   *  inferred in one task can never itself count as a known person for another. */
  private peopleByPath = new Map<string, string[]>();
  private listeners = new Set<Listener>();
  private scanning: Promise<void> | null = null;
  private requestedScan = 0;
  private appliedScan = 0;
  private scanFailures: string[] = [];
  private scanned = false;

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

  /**
   * Whether a full scan has finished at least once.
   *
   * Before that the index is not empty, it is **unknown**, and the two are not the same thing:
   * anything that reconciles saved state against the index (the day's plan) has to wait, or it
   * reads a vault that has not been opened yet as a vault where nothing exists.
   */
  get ready(): boolean {
    return this.scanned;
  }

  /** Paths that could not be read in the last completed full scan. */
  get failures(): readonly string[] {
    return this.scanFailures;
  }

  async rebuild(): Promise<void> {
    this.requestedScan++;
    if (!this.scanning) {
      this.scanning = this.runRequestedScans().finally(() => {
        this.scanning = null;
      });
    }
    await this.scanning;
  }

  async reindex(file: TFile): Promise<void> {
    // A scan in flight is about to read this file itself; letting both run would race, and the
    // scan's older read could win. Waiting for it costs nothing outside the first seconds.
    if (this.scanning) await this.scanning;
    await this.load(file, true);
  }

  remove(path: string): void {
    this.peopleByPath.delete(path);
    if (this.byPath.delete(path)) {
      this.mtimes.delete(path);
      this.emit();
    }
  }

  async rename(file: TFile, oldPath: string): Promise<void> {
    this.byPath.delete(oldPath);
    this.mtimes.delete(oldPath);
    this.peopleByPath.delete(oldPath);
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

  /** Serialises rebuilds and only publishes a scan made with the newest configuration. */
  private async runRequestedScans(): Promise<void> {
    while (this.appliedScan < this.requestedScan) {
      const revision = this.requestedScan;
      const result = await this.scan(this.scope, this.interop, this.rules);
      if (revision !== this.requestedScan) continue;

      this.byPath = result.byPath;
      this.mtimes = result.mtimes;
      this.peopleByPath = result.peopleByPath;
      this.scanFailures = result.failures;
      this.appliedScan = revision;
      this.scanned = true;
      Logger.info(`indexed ${this.all().length} tasks from ${this.byPath.size} notes`);
      this.emit();
    }
  }

  private async scan(scope: ScopeFilter, interop: TasksInterop, rules: ContextRules): Promise<ScanResult> {
    const files = this.app.vault.getMarkdownFiles().filter((file) => scope.includes(file.path));
    const byPath = new Map<string, Task[]>();
    const mtimes = new Map<string, number>();
    const peopleByPath = new Map<string, string[]>();
    const failures: string[] = [];

    // Frontmatter is already in Obsidian's metadata cache, so this whole-vault pass costs no
    // I/O. Doing it up front — before any task line is parsed — makes a "Nom:" prefix resolve
    // the same way regardless of which read batch below happens to land first.
    for (const file of files) {
      peopleByPath.set(file.path, peopleOf(this.app.metadataCache.getFileCache(file)?.frontmatter));
    }
    const knownPeople = new Set(Array.from(peopleByPath.values()).flat());

    for (let i = 0; i < files.length; i += READ_BATCH) {
      const batch = await Promise.all(
        files
          .slice(i, i + READ_BATCH)
          .map((file) => this.read(file, byPath, mtimes, peopleByPath, knownPeople, interop, rules))
      );
      for (const failed of batch) if (failed) failures.push(failed);
    }
    return { byPath, mtimes, peopleByPath, failures };
  }

  private async load(file: TFile, notify: boolean): Promise<void> {
    if (!this.scope.includes(file.path)) {
      this.peopleByPath.delete(file.path);
      if (this.byPath.delete(file.path) && notify) this.emit();
      return;
    }
    const knownPeople = new Set(Array.from(this.peopleByPath.values()).flat());
    await this.read(file, this.byPath, this.mtimes, this.peopleByPath, knownPeople, this.interop, this.rules);
    if (notify) this.emit();
  }

  /** Reads and parses one note into the given maps. Callers check the scope first. */
  private async read(
    file: TFile,
    byPath: Map<string, Task[]>,
    mtimes: Map<string, number>,
    peopleByPath: Map<string, string[]>,
    knownPeople: ReadonlySet<string>,
    interop: TasksInterop,
    rules: ContextRules
  ): Promise<string | null> {
    try {
      const content = await this.app.vault.cachedRead(file);
      const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter;
      peopleByPath.set(file.path, peopleOf(frontmatter));
      const tasks = tasksFromFile({ path: file.path, content, frontmatter }, interop, rules, knownPeople);
      if (tasks.length > 0) {
        byPath.set(file.path, tasks);
      } else {
        byPath.delete(file.path);
      }
      mtimes.set(file.path, file.stat.mtime);
      return null;
    } catch (err) {
      Logger.error(`failed to index ${file.path}`, err);
      const previous = this.byPath.get(file.path);
      if (previous) byPath.set(file.path, previous);
      const previousMtime = this.mtimes.get(file.path);
      if (previousMtime !== undefined) mtimes.set(file.path, previousMtime);
      return file.path;
    }
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }
}
