import { Notice, Plugin, TFile, type WorkspaceLeaf } from "obsidian";
import { TaskIndex } from "./index/TaskIndex";
import { ScopeFilter, parseObsidianIgnoreFilters } from "./index/ScopeFilter";
import { serializeTaskCache } from "./index/TaskCache";
import { DEFAULT_INTEROP, TASKS_PLUGIN_DATA, parseTasksData, type TasksInterop } from "./tasks/TasksPluginSettings";
import { TaskWriter } from "./tasks/TaskWriter";
import { TaskActions } from "./tasks/TaskActions";
import { EmptyTaskCleaner } from "./tasks/EmptyTaskCleaner";
import { DEFAULT_SETTINGS, contextRulesOf, type TaskSmithSettings } from "./settings/Config";
import { TaskSmithSettingTab } from "./settings/SettingsTab";
import { SIDEBAR_VIEW, SidebarView } from "./views/SidebarView";
import { CONTROL_CENTRE_VIEW, ControlCentreView } from "./views/ControlCentre";
import { DayPlannerModal } from "./views/DayPlannerModal";
import { bucketCounts, type QueryState } from "./query/Query";
import { Logger } from "./utils/Logger";
import { t } from "./i18n/strings";

export default class TaskSmithPlugin extends Plugin {
  settings: TaskSmithSettings = { ...DEFAULT_SETTINGS };
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
          (filter) => void this.openControlCentre(filter),
          // The day's plan and the folded sections live in settings, so they survive a reload.
          () => this.saveData(this.settings)
        )
    );
    this.registerView(
      CONTROL_CENTRE_VIEW,
      (leaf) =>
        new ControlCentreView(
          leaf,
          this.index,
          this.actions,
          this.settings,
          () => this.openDayPlanner(),
          () => this.saveData(this.settings)
        )
    );

    this.ribbon = this.addRibbonIcon("list-checks", t("ribbon.tasks"), () => void this.openSidebar());
    this.ribbon.addClass("tc-ribbon");
    this.addSettingTab(new TaskSmithSettingTab(this.app, this));

    this.addCommand({ id: "open-sidebar", name: t("command.openSidebar"), callback: () => void this.openSidebar() });
    this.addCommand({ id: "plan-day", name: t("controlCentre.planDay"), callback: () => this.openDayPlanner() });
    // Still `open-triage` from when this tab was the triage view: a command id is API once released.
    this.addCommand({
      id: "open-triage",
      name: t("command.openControlCentre"),
      callback: () => void this.openControlCentre(),
    });
    this.addCommand({ id: "rebuild-index", name: t("command.rebuildIndex"), callback: () => void this.rebuild() });
    this.addCommand({
      id: "clean-empty-tasks",
      name: t("command.cleanEmptyTasks"),
      callback: () => {
        void this.cleaner.clean(this.index.all()).then((deleted) => {
          if (deleted === 0) new Notice(t("notice.noEmptyTasks"));
        });
      },
    });
    // Deliberately without a default hotkey: Mod+Z belongs to the editor. Bind it yourself
    // if you want one — the notices carry their own Undo button.
    this.addCommand({
      id: "undo-last-write",
      name: t("command.undoLastWrite"),
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
    const stored = (await this.loadData()) as Partial<TaskSmithSettings> | null;
    this.settings = { ...DEFAULT_SETTINGS, ...(stored ?? {}) };
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
    this.index.setScope(await this.buildScope());
    this.index.setContextRules(contextRulesOf(this.settings));
    await this.rebuild();
    for (const type of [SIDEBAR_VIEW, CONTROL_CENTRE_VIEW]) {
      for (const leaf of this.app.workspace.getLeavesOfType(type)) {
        const view = leaf.view;
        if (view instanceof SidebarView || view instanceof ControlCentreView) view.setSettings(this.settings);
      }
    }
  }

  private async undoLastWrite(): Promise<void> {
    const result = await this.actions.undo();
    if (!result.ok) {
      new Notice(t("notice.nothingToUndo"));
      return;
    }
    new Notice(
      result.skipped === 0
        ? t("notice.undoRestored", { label: result.label, restored: result.restored })
        : t("notice.undoRestoredWithSkipped", { label: result.label, restored: result.restored, skipped: result.skipped })
    );
  }

  private async rebuild(): Promise<void> {
    this.interop = await this.readTasksInterop();
    this.index.setInterop(this.interop);
    this.actions.setInterop(this.interop);
    await this.index.rebuild();
    // Not `saveSettings()`: that also re-triggers `rebuild()` itself. This is the same
    // `saveData` primitive the views' own `persist` callbacks use.
    this.settings.taskCache = serializeTaskCache(this.index.all(), new Date());
    await this.saveData(this.settings);
    this.updateBadge();
    await this.cleaner.clean(this.index.all());
  }

  private async buildScope(): Promise<ScopeFilter> {
    const excluded = [...this.settings.excludedFolders];
    if (this.settings.respectObsidianIgnoreFilters) {
      const appJson = await this.readVaultFile(this.configPath("app.json"));
      if (appJson) excluded.push(...parseObsidianIgnoreFilters(appJson));
    }
    return new ScopeFilter(excluded);
  }

  private async readTasksInterop(): Promise<TasksInterop> {
    const raw = await this.readVaultFile(this.configPath(TASKS_PLUGIN_DATA));
    if (!raw) {
      Logger.warn("Tasks plugin data not found; falling back to built-in defaults");
      return DEFAULT_INTEROP;
    }
    return parseTasksData(raw);
  }

  /** The config folder is `.obsidian` by default but the user can rename it, so always ask. */
  private configPath(relative: string): string {
    return `${this.app.vault.configDir}/${relative}`;
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
    let leaf = this.app.workspace.getLeavesOfType(SIDEBAR_VIEW)[0] ?? null;
    if (!leaf) {
      leaf = this.app.workspace.getRightLeaf(false);
      if (!leaf) {
        new Notice(t("notice.cantOpenSidebar"));
        return;
      }
      await leaf.setViewState({ type: SIDEBAR_VIEW, active: true });
    }
    await this.app.workspace.revealLeaf(leaf);
  }

  private openDayPlanner(): void {
    new DayPlannerModal(
      this.app,
      this.index,
      this.actions,
      this.settings,
      () => this.saveData(this.settings),
      () => {
        for (const leaf of this.app.workspace.getLeavesOfType(SIDEBAR_VIEW)) {
          if (leaf.view instanceof SidebarView) leaf.view.refresh();
        }
      }
    ).open();
  }

  private async openControlCentre(filter?: Partial<QueryState>): Promise<void> {
    const existing = this.app.workspace.getLeavesOfType(CONTROL_CENTRE_VIEW)[0];
    const leaf: WorkspaceLeaf = existing ?? this.app.workspace.getLeaf("tab");
    await leaf.setViewState({ type: CONTROL_CENTRE_VIEW, active: true });
    await this.app.workspace.revealLeaf(leaf);
    if (filter && leaf.view instanceof ControlCentreView) leaf.view.applyFilter(filter);
  }
}
