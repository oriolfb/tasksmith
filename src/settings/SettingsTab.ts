import { type App, PluginSettingTab, Setting } from "obsidian";
import type TaskSmithPlugin from "../main";
import { t } from "../i18n/strings";
import { DebouncedAction } from "../utils/DebouncedAction";

export class TaskSmithSettingTab extends PluginSettingTab {
  private readonly indexRefresh = new DebouncedAction(300);

  constructor(app: App, private readonly plugin: TaskSmithPlugin) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    // Which build is actually running. Obsidian only re-reads main.js when the plugin is
    // re-enabled, so "I reloaded" and "the new code is running" are not the same claim.
    new Setting(containerEl)
      .setName(t("settings.loadedVersion.name"))
      .setDesc(t("settings.loadedVersion.desc", { version: this.plugin.manifest.version }));

    new Setting(containerEl)
      .setName(t("settings.excludedFolders.name"))
      .setDesc(t("settings.excludedFolders.desc"))
      .addTextArea((text) =>
        text
          .setPlaceholder(t("settings.excludedFolders.placeholder"))
          .setValue(this.plugin.settings.excludedFolders.join("\n"))
          .onChange(async (value) => {
            this.plugin.settings.excludedFolders = lines(value);
            await this.saveTextSetting();
          })
      );

    new Setting(containerEl)
      .setName(t("settings.respectObsidianExcluded.name"))
      .setDesc(t("settings.respectObsidianExcluded.desc"))
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.respectObsidianIgnoreFilters).onChange(async (value) => {
          this.plugin.settings.respectObsidianIgnoreFilters = value;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName(t("settings.deadlineNotes.name"))
      .setDesc(t("settings.deadlineNotes.desc"))
      .addTextArea((text) =>
        text
          .setPlaceholder(t("settings.deadlineNotes.placeholder"))
          .setValue(this.plugin.settings.deadlineFromNotes.join("\n"))
          .onChange(async (value) => {
            this.plugin.settings.deadlineFromNotes = lines(value);
            await this.saveTextSetting();
          })
      );

    new Setting(containerEl)
      .setName(t("settings.docTypes.name"))
      .setDesc(t("settings.docTypes.desc"))
      .addTextArea((text) =>
        text
          .setPlaceholder(t("settings.docTypes.placeholder"))
          .setValue(this.plugin.settings.referenceNoteTypes.join("\n"))
          .onChange(async (value) => {
            this.plugin.settings.referenceNoteTypes = lines(value);
            await this.saveTextSetting();
          })
      );

    new Setting(containerEl)
      .setName(t("settings.somedayTypes.name"))
      .setDesc(t("settings.somedayTypes.desc"))
      .addTextArea((text) =>
        text
          .setPlaceholder(t("settings.somedayTypes.placeholder"))
          .setValue(this.plugin.settings.somedayNoteTypes.join("\n"))
          .onChange(async (value) => {
            this.plugin.settings.somedayNoteTypes = lines(value);
            await this.saveTextSetting();
          })
      );

    new Setting(containerEl)
      .setName(t("settings.staleDays.name"))
      .setDesc(t("settings.staleDays.desc"))
      .addText((text) =>
        text.setValue(String(this.plugin.settings.staleThresholdDays)).onChange(async (value) => {
          const parsed = Number.parseInt(value, 10);
          if (Number.isFinite(parsed) && parsed > 0) {
            this.plugin.settings.staleThresholdDays = parsed;
            await this.plugin.saveSettings(false);
          }
        })
      );

    new Setting(containerEl)
      .setName(t("settings.autoDeleteEmpty.name"))
      .setDesc(t("settings.autoDeleteEmpty.desc"))
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.autoDeleteEmptyTasks).onChange(async (value) => {
          this.plugin.settings.autoDeleteEmptyTasks = value;
          await this.plugin.saveSettings(value);
        })
      );

    new Setting(containerEl)
      .setName(t("settings.weekendsInStrip.name"))
      .setDesc(t("settings.weekendsInStrip.desc"))
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.showWeekends).onChange(async (value) => {
          this.plugin.settings.showWeekends = value;
          await this.plugin.saveSettings(false);
        })
      );

    new Setting(containerEl)
      .setName(t("settings.persistTaskCache.name"))
      .setDesc(t("settings.persistTaskCache.desc"))
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.persistTaskCache).onChange(async (value) => {
          this.plugin.settings.persistTaskCache = value;
          if (!value) this.plugin.settings.taskCache = null;
          await this.plugin.saveSettings(false);
        })
      );

    new Setting(containerEl)
      .setName(t("settings.overdueBadge.name"))
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.showOverdueBadge).onChange(async (value) => {
          this.plugin.settings.showOverdueBadge = value;
          await this.plugin.saveSettings(false);
        })
      );
  }

  private async saveTextSetting(): Promise<void> {
    await this.plugin.saveSettings(false);
    this.indexRefresh.schedule(() => void this.plugin.refreshSettingsIndex());
  }
}

function lines(value: string): string[] {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}
