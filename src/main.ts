import { Notice, Plugin, TFile, type WorkspaceLeaf } from "obsidian";
import { TaskIndex } from "./index/TaskIndex";
import { ScopeFilter, parseObsidianIgnoreFilters } from "./index/ScopeFilter";
import { DEFAULT_INTEROP, TASKS_PLUGIN_DATA, parseTasksData, type TasksInterop } from "./tasks/TasksPluginSettings";
import { TaskWriter } from "./tasks/TaskWriter";
import { TaskActions } from "./tasks/TaskActions";
import { EmptyTaskCleaner } from "./tasks/EmptyTaskCleaner";
import { DEFAULT_SETTINGS, contextRulesOf, type TaskConsoleSettings } from "./settings/Config";
import { TaskConsoleSettingTab } from "./settings/SettingsTab";
import { SIDEBAR_VIEW, SidebarView } from "./views/SidebarView";
import { TRIAGE_VIEW, TriageView } from "./views/TriageView";
import { bucketCounts, type QueryState } from "./query/Query";
import { Logger } from "./utils/Logger";

export default class TaskConsolePlugin extends Plugin {
  settings: TaskConsoleSettings = { ...DEFAULT_SETTINGS };
  private interop: TasksInterop = DEFAULT_INTEROP;
  private index!: TaskIndex;
  private actions!: TaskActions;
  private cleaner!: EmptyTaskCleaner;
  private ribbon: HTMLElement | null = null;
  /** The note that had focus before the current one, so it can be cleaned on the way out. */
  private previousActivePath: string | null = null;

  async onload(): Promise<void> {
    await this.loadSettings();
    this.interop = await this.readTasksInterop();

    const writer = new TaskWriter(this.app);
    this.index = new TaskIndex(this.app, await this.buildScope(), this.interop, contextRulesOf(this.settings));
    this.actions = new TaskActions(writer, this.interop);
    this.cleaner = new EmptyTaskCleaner(writer, {
      enabled: () => this.settings.autoDeleteEmptyTasks,
      activePath: () => this.app.workspace.getActiveFile()?.path ?? null,
    });

    this.registerView(
      SIDEBAR_VIEW,
      (leaf) =>
        new SidebarView(
          leaf,
          this.index,
          this.actions,
          this.settings,
          (filter) => void this.openTriage(filter),
          // The day's plan and the folded sections live in settings, so they survive a reload.
          () => this.saveData(this.settings)
        )
    );
    this.registerView(
      TRIAGE_VIEW,
      (leaf) => new TriageView(leaf, this.index, this.actions, this.settings, () => this.saveSettings())
    );

    this.ribbon = this.addRibbonIcon("list-checks", "Tasques", () => void this.openSidebar());
    this.ribbon.addClass("tc-ribbon");
    this.addSettingTab(new TaskConsoleSettingTab(this.app, this));

    this.addCommand({ id: "open-sidebar", name: "Obrir la barra lateral de tasques", callback: () => void this.openSidebar() });
    this.addCommand({ id: "open-triage", name: "Obrir la vista de triatge", callback: () => void this.openTriage() });
    this.addCommand({ id: "rebuild-index", name: "Refer l'índex de tasques", callback: () => void this.rebuild() });
    this.addCommand({
      id: "clean-empty-tasks",
      name: "Eliminar les tasques buides ara",
      callback: () => {
        void this.cleaner.clean(this.index.all()).then((deleted) => {
          if (deleted === 0) new Notice("Cap tasca buida per eliminar");
        });
      },
    });
    // Deliberately without a default hotkey: Mod+Z belongs to the editor. Bind it yourself
    // if you want one — the notices carry their own Desfés button.
    this.addCommand({
      id: "undo-last-write",
      name: "Desfés l'últim canvi del plugin",
      checkCallback: (checking) => {
        const label = this.actions.undoLabel();
        if (checking) return label !== null;
        void this.undoLastWrite();
        return true;
      },
    });

    this.registerEvent(
      this.app.metadataCache.on("changed", (file) => {
        void this.index.reindex(file).then(() => this.cleaner.cleanPath(this.index.all(), file.path));
      })
    );
    this.registerEvent(
      this.app.workspace.on("active-leaf-change", () => {
        const current = this.app.workspace.getActiveFile()?.path ?? null;
        const left = this.previousActivePath;
        this.previousActivePath = current;
        // A placeholder the user was typing into becomes fair game once they move away.
        if (left && left !== current) void this.cleaner.cleanPath(this.index.all(), left);
      })
    );
    this.registerEvent(
      this.app.vault.on("delete", (file) => {
        this.index.remove(file.path);
      })
    );
    this.registerEvent(
      this.app.vault.on("rename", (file, oldPath) => {
        if (file instanceof TFile) void this.index.rename(file, oldPath);
        else this.index.remove(oldPath);
      })
    );

    this.index.onChange(() => this.updateBadge());

    this.app.workspace.onLayoutReady(() => {
      this.previousActivePath = this.app.workspace.getActiveFile()?.path ?? null;
      void this.rebuild();
    });
  }

  async loadSettings(): Promise<void> {
    const stored = (await this.loadData()) as Partial<TaskConsoleSettings> | null;
    this.settings = { ...DEFAULT_SETTINGS, ...(stored ?? {}) };
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
    this.index.setScope(await this.buildScope());
    this.index.setContextRules(contextRulesOf(this.settings));
    await this.rebuild();
    for (const type of [SIDEBAR_VIEW, TRIAGE_VIEW]) {
      for (const leaf of this.app.workspace.getLeavesOfType(type)) {
        const view = leaf.view;
        if (view instanceof SidebarView || view instanceof TriageView) view.setSettings(this.settings);
      }
    }
  }

  private async undoLastWrite(): Promise<void> {
    const result = await this.actions.undo();
    if (!result.ok) {
      new Notice("No hi ha res per desfer");
      return;
    }
    new Notice(
      result.skipped === 0
        ? `Desfet: ${result.label} · ${result.restored} línies restaurades`
        : `Desfet: ${result.label} · ${result.restored} restaurades, ${result.skipped} ja havien canviat`
    );
  }

  private async rebuild(): Promise<void> {
    this.interop = await this.readTasksInterop();
    this.index.setInterop(this.interop);
    this.actions.setInterop(this.interop);
    await this.index.rebuild();
    this.updateBadge();
    await this.cleaner.clean(this.index.all());
  }

  private async buildScope(): Promise<ScopeFilter> {
    const excluded = [...this.settings.excludedFolders];
    if (this.settings.respectObsidianIgnoreFilters) {
      const appJson = await this.readVaultFile(".obsidian/app.json");
      if (appJson) excluded.push(...parseObsidianIgnoreFilters(appJson));
    }
    return new ScopeFilter(excluded);
  }

  private async readTasksInterop(): Promise<TasksInterop> {
    const raw = await this.readVaultFile(TASKS_PLUGIN_DATA);
    if (!raw) {
      Logger.warn("Tasks plugin data not found; falling back to built-in defaults");
      return DEFAULT_INTEROP;
    }
    return parseTasksData(raw);
  }

  private async readVaultFile(path: string): Promise<string | null> {
    try {
      if (!(await this.app.vault.adapter.exists(path))) return null;
      return await this.app.vault.adapter.read(path);
    } catch (err) {
      Logger.warn(`could not read ${path}`, err);
      return null;
    }
  }

  private updateBadge(): void {
    if (!this.ribbon) return;
    const existing = this.ribbon.querySelector(".tc-badge");
    existing?.remove();
    if (!this.settings.showOverdueBadge) return;

    const overdue = bucketCounts(this.index.all()).overdue;
    if (overdue === 0) return;
    const badge = this.ribbon.createSpan({ cls: "tc-badge" });
    badge.setText(String(overdue));
  }

  private async openSidebar(): Promise<void> {
    const existing = this.app.workspace.getLeavesOfType(SIDEBAR_VIEW)[0];
    if (existing) {
      await this.app.workspace.revealLeaf(existing);
      return;
    }
    const leaf = this.app.workspace.getRightLeaf(false);
    if (!leaf) {
      new Notice("No he pogut obrir la barra lateral dreta");
      return;
    }
    await leaf.setViewState({ type: SIDEBAR_VIEW, active: true });
    await this.app.workspace.revealLeaf(leaf);
  }

  private async openTriage(filter?: Partial<QueryState>): Promise<void> {
    const existing = this.app.workspace.getLeavesOfType(TRIAGE_VIEW)[0];
    const leaf: WorkspaceLeaf = existing ?? this.app.workspace.getLeaf("tab");
    await leaf.setViewState({ type: TRIAGE_VIEW, active: true });
    await this.app.workspace.revealLeaf(leaf);
    if (filter && leaf.view instanceof TriageView) leaf.view.applyFilter(filter);
  }
}
