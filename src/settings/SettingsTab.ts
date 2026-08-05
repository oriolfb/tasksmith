import { type App, PluginSettingTab, Setting } from "obsidian";
import type TaskConsolePlugin from "../main";

export class TaskConsoleSettingTab extends PluginSettingTab {
  constructor(app: App, private readonly plugin: TaskConsolePlugin) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    // Which build is actually running. Obsidian only re-reads main.js when the plugin is
    // re-enabled, so "I reloaded" and "the new code is running" are not the same claim.
    new Setting(containerEl)
      .setName("Versió carregada")
      .setDesc(
        `${this.plugin.manifest.version} · si no coincideix amb l'última desplegada, desactiva i torna a activar el plugin.`
      );

    new Setting(containerEl)
      .setName("Carpetes excloses")
      .setDesc("Una per línia. Les tasques d'aquestes carpetes no s'indexen.")
      .addTextArea((text) =>
        text
          .setPlaceholder("96 IA Docs\n07 Arxiu")
          .setValue(this.plugin.settings.excludedFolders.join("\n"))
          .onChange(async (value) => {
            this.plugin.settings.excludedFolders = lines(value);
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Respectar els fitxers exclosos d'Obsidian")
      .setDesc("Afegeix el que ja tens configurat a Opcions → Fitxers i enllaços → Fitxers exclosos.")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.respectObsidianIgnoreFilters).onChange(async (value) => {
          this.plugin.settings.respectObsidianIgnoreFilters = value;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName("Notes que posen termini a les seves tasques")
      .setDesc(
        "Una per línia: una etiqueta o un valor de «tipus» de la nota. Les tasques sense data pròpia dins d'aquestes notes hereten el «data:» del frontmatter com a venciment. La data de les altres notes només serveix per saber quant fa que existeix la tasca."
      )
      .addTextArea((text) =>
        text
          .setPlaceholder("Nota_Diaria\nNota_Setmanal")
          .setValue(this.plugin.settings.deadlineFromNotes.join("\n"))
          .onChange(async (value) => {
            this.plugin.settings.deadlineFromNotes = lines(value);
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Tipus de nota que són documentació")
      .setDesc(
        "Valors de «tipus» les caselles dels quals no són compromisos (per exemple una plantilla o un manual). No s'esborra res: queden fora dels comptadors i es poden veure amb un filtre."
      )
      .addTextArea((text) =>
        text
          .setPlaceholder("documentacio")
          .setValue(this.plugin.settings.referenceNoteTypes.join("\n"))
          .onChange(async (value) => {
            this.plugin.settings.referenceNoteTypes = lines(value);
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Tipus de nota que són «algun dia»")
      .setDesc("Buit per defecte. Afegeix-hi «idea» si vols que les intencions no comptin com a tasques del dia.")
      .addTextArea((text) =>
        text
          .setPlaceholder("idea")
          .setValue(this.plugin.settings.somedayNoteTypes.join("\n"))
          .onChange(async (value) => {
            this.plugin.settings.somedayNoteTypes = lines(value);
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Dies per considerar una tasca estancada")
      .setDesc("Es compta des de la data de creació, o de la data de la nota, o de l'última modificació.")
      .addText((text) =>
        text.setValue(String(this.plugin.settings.staleThresholdDays)).onChange(async (value) => {
          const parsed = Number.parseInt(value, 10);
          if (Number.isFinite(parsed) && parsed > 0) {
            this.plugin.settings.staleThresholdDays = parsed;
            await this.plugin.saveSettings();
          }
        })
      );

    new Setting(containerEl)
      .setName("Eliminar automàticament les tasques buides")
      .setDesc(
        "Desactivat per defecte. Si l'actives, esborra la línia sencera de les tasques sense cap contingut (`- [ ]` de plantilla) en desar una nota. Mai toca la nota que tens oberta, ni una tasca amb subtasques, i cada neteja es pot desfer amb «Desfés l'últim canvi del plugin»."
      )
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.autoDeleteEmptyTasks).onChange(async (value) => {
          this.plugin.settings.autoDeleteEmptyTasks = value;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName("Comptador d'endarrerides a la barra lateral d'icones")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.showOverdueBadge).onChange(async (value) => {
          this.plugin.settings.showOverdueBadge = value;
          await this.plugin.saveSettings();
        })
      );
  }
}

function lines(value: string): string[] {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}
