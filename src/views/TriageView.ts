import { Notice, setIcon, type WorkspaceLeaf } from "obsidian";
import { PromptModal } from "./PromptModal";
import { ConfirmModal } from "./ConfirmModal";
import { undoableNotice } from "./UndoNotice";
import type { TaskIndex } from "../index/TaskIndex";
import type { TaskActions } from "../tasks/TaskActions";
import type { TaskConsoleSettings } from "../settings/Config";
import { BaseTaskView } from "./BaseTaskView";
import { NO_PROJECT, type GroupKey, type SortKey, type StatusScope } from "../query/Query";
import { addDays, startOfToday } from "../index/dates";
import type { Task } from "../types/task";

export const TRIAGE_VIEW = "task-console-triage";

export class TriageView extends BaseTaskView {
  private bulkHost!: HTMLElement;
  private projectSelect!: HTMLSelectElement;
  private viewSelect!: HTMLSelectElement;
  private searchInput!: HTMLInputElement;
  private statusSelect!: HTMLSelectElement;
  private groupSelect!: HTMLSelectElement;
  private sortSelect!: HTMLSelectElement;
  private undatedButton!: HTMLButtonElement;

  constructor(
    leaf: WorkspaceLeaf,
    index: TaskIndex,
    actions: TaskActions,
    settings: TaskConsoleSettings,
    private readonly persist: () => Promise<void>
  ) {
    super(leaf, index, actions, settings, { wide: true, selectable: true });
  }

  getViewType(): string {
    return TRIAGE_VIEW;
  }

  getDisplayText(): string {
    return "Triatge de tasques";
  }

  getIcon(): string {
    return "layout-list";
  }

  protected build(): void {
    const root = this.containerEl.children[1] as HTMLElement;
    root.empty();
    root.addClass("tc-triage");

    const bar = root.createDiv({ cls: "tc-triage-bar" });

    const search = bar.createEl("input", { cls: "tc-search", type: "search" });
    search.placeholder = "Cerca…";
    search.addEventListener("input", () => {
      this.query = { ...this.query, text: search.value };
      this.refresh();
    });
    this.searchInput = search;

    this.statusSelect = this.select(bar, "Estat", [
      ["open", "Obertes"],
      ["closed", "Tancades"],
      ["all", "Totes"],
    ] as [StatusScope, string][], (value) => {
      this.query = { ...this.query, statusScope: value };
      this.refresh();
    });

    this.groupSelect = this.select(bar, "Agrupar", [
      ["bucket", "Per termini"],
      ["person", "Amb qui"],
      ["project", "Per projecte"],
      ["area", "Per àrea"],
      ["note", "Per nota"],
      ["none", "Sense agrupar"],
    ] as [GroupKey, string][], (value) => {
      this.query = { ...this.query, group: value };
      this.refresh();
    });

    this.sortSelect = this.select(bar, "Ordenar", [
      ["date", "Per data"],
      ["age", "Per antiguitat"],
      ["priority", "Per prioritat"],
      ["note", "Per nota"],
    ] as [SortKey, string][], (value) => {
      this.query = { ...this.query, sort: value };
      this.refresh();
    });

    const project = bar.createDiv({ cls: "tc-field" });
    project.createSpan({ cls: "tc-field-label", text: "Projecte" });
    this.projectSelect = project.createEl("select", { cls: "dropdown" });
    this.projectSelect.addEventListener("change", () => {
      const value = this.projectSelect.value;
      this.query = { ...this.query, project: value === "__all__" ? null : value };
      this.refresh();
    });

    const undated = bar.createEl("button", { cls: "tc-toggle" });
    undated.setText("Només sense data");
    undated.addEventListener("click", () => {
      const active = this.query.buckets?.length === 1 && this.query.buckets[0] === "undated";
      this.query = { ...this.query, buckets: active ? null : ["undated"] };
      undated.toggleClass("tc-toggle-on", !active);
      this.refresh();
    });
    this.undatedButton = undated;

    this.buildSavedViews(bar);

    this.bulkHost = root.createDiv({ cls: "tc-bulk tc-hidden" });
    this.listHost = root.createDiv({ cls: "tc-list tc-list-wide" });
  }

  private buildSavedViews(bar: HTMLElement): void {
    const field = bar.createDiv({ cls: "tc-field" });
    field.createSpan({ cls: "tc-field-label", text: "Vista desada" });

    const row = field.createDiv({ cls: "tc-saved-row" });
    this.viewSelect = row.createEl("select", { cls: "dropdown" });
    this.viewSelect.addEventListener("change", () => {
      const saved = this.settings.savedViews.find((view) => view.name === this.viewSelect.value);
      if (!saved) return;
      this.query = { ...saved.query };
      this.refresh();
    });

    const save = row.createEl("button", { cls: "tc-toggle" });
    setIcon(save, "save");
    save.setAttribute("aria-label", "Desar els filtres actuals com a vista");
    save.addEventListener("click", () => void this.saveCurrentView());

    const remove = row.createEl("button", { cls: "tc-toggle" });
    setIcon(remove, "trash-2");
    remove.setAttribute("aria-label", "Esborrar la vista seleccionada");
    remove.addEventListener("click", () => void this.deleteCurrentView());
  }

  private async saveCurrentView(): Promise<void> {
    const name = await PromptModal.ask(this.app, "Nom de la vista", this.viewSelect.value);
    if (!name) return;

    const existing = this.settings.savedViews.findIndex((view) => view.name === name);
    const entry = { name, query: { ...this.query } };
    if (existing >= 0) this.settings.savedViews[existing] = entry;
    else this.settings.savedViews.push(entry);

    await this.persist();
    this.syncSavedViews(name);
    new Notice(`Vista "${name}" desada`);
  }

  private async deleteCurrentView(): Promise<void> {
    const name = this.viewSelect.value;
    const index = this.settings.savedViews.findIndex((view) => view.name === name);
    if (index < 0) return;
    this.settings.savedViews.splice(index, 1);
    await this.persist();
    this.syncSavedViews("");
    new Notice(`Vista "${name}" esborrada`);
  }

  private syncSavedViews(selected: string): void {
    const names = this.settings.savedViews.map((view) => view.name);
    const wanted = ["", ...names];
    const current = Array.from(this.viewSelect.options).map((option) => option.value);
    if (current.join("|") !== wanted.join("|")) {
      const previous = this.viewSelect.value;
      this.viewSelect.empty();
      for (const value of wanted) {
        this.viewSelect.createEl("option", { value, text: value === "" ? "—" : value });
      }
      if (wanted.includes(previous)) this.viewSelect.value = previous;
    }
    if (wanted.includes(selected)) this.viewSelect.value = selected;
  }

  /** Loading a saved view changes the query behind the controls; push it back into them. */
  private syncControls(): void {
    this.searchInput.value = this.query.text;
    this.statusSelect.value = this.query.statusScope;
    this.groupSelect.value = this.query.group;
    this.sortSelect.value = this.query.sort;
    this.projectSelect.value = this.query.project ?? "__all__";
    this.undatedButton.toggleClass(
      "tc-toggle-on",
      this.query.buckets?.length === 1 && this.query.buckets[0] === "undated"
    );
  }

  private select<T extends string>(
    host: HTMLElement,
    label: string,
    options: [T, string][],
    onChange: (value: T) => void
  ): HTMLSelectElement {
    const field = host.createDiv({ cls: "tc-field" });
    field.createSpan({ cls: "tc-field-label", text: label });
    const select = field.createEl("select", { cls: "dropdown" });
    for (const [value, text] of options) select.createEl("option", { value, text });
    select.addEventListener("change", () => onChange(select.value as T));
    return select;
  }

  protected onSelectionChange(): void {
    this.renderBulkBar();
  }

  protected afterRefresh(): void {
    this.syncProjects();
    this.syncSavedViews(this.viewSelect.value);
    this.syncControls();
    this.renderBulkBar();
  }

  private syncProjects(): void {
    const projects = new Set<string>();
    for (const task of this.index.all()) projects.add(task.project ?? NO_PROJECT);
    const wanted = ["__all__", ...[...projects].sort((a, b) => a.localeCompare(b))];
    const current = Array.from(this.projectSelect.options).map((o) => o.value);
    if (current.join("|") === wanted.join("|")) return;

    const selected = this.projectSelect.value;
    this.projectSelect.empty();
    for (const value of wanted) {
      this.projectSelect.createEl("option", { value, text: value === "__all__" ? "Tots" : value });
    }
    if (wanted.includes(selected)) this.projectSelect.value = selected;
  }

  private renderBulkBar(): void {
    const selected = this.renderer.selectedFrom(this.index.all());
    this.bulkHost.toggleClass("tc-hidden", selected.length === 0);
    if (selected.length === 0) return;

    this.bulkHost.empty();
    this.bulkHost.createSpan({ cls: "tc-bulk-count", text: `${selected.length} seleccionades` });

    const actions: [string, () => Promise<void>][] = [
      ["Avui", () => this.bulk(selected, (task) => this.actions.today(task), "Avui")],
      ["Demà", () => this.bulk(selected, (task) => this.actions.tomorrow(task), "Demà")],
      ["+1 setmana", () => this.bulk(selected, (task) => this.actions.nextWeek(task), "+1 setmana")],
      ["Divendres", () => this.bulk(selected, (task) => this.actions.scheduleOn(task, nextFriday()), "Divendres")],
      ["Treure data", () => this.bulk(selected, (task) => this.actions.clearDue(task), "Treure la data")],
      ["Cancel·lar", () => this.bulk(selected, (task) => this.actions.cancel(task), "Cancel·lar")],
    ];

    for (const [label, run] of actions) {
      const button = this.bulkHost.createEl("button", { cls: "tc-bulk-action", text: label });
      button.addEventListener("click", () => void run());
    }

    const remove = this.bulkHost.createEl("button", { cls: "tc-bulk-action tc-bulk-danger", text: "Eliminar" });
    remove.addEventListener("click", () => void this.bulkDelete(selected));

    const clear = this.bulkHost.createEl("button", { cls: "tc-bulk-action tc-bulk-clear", text: "Desmarcar" });
    clear.addEventListener("click", () => {
      this.renderer.clearSelection();
      this.refresh();
    });
  }

  /** Deleting several lines at once still asks first, even though it can now be undone. */
  private async bulkDelete(tasks: Task[]): Promise<void> {
    const confirmed = await ConfirmModal.ask(
      this.app,
      "Eliminar tasques",
      `S'eliminaran ${tasks.length} línies de les seves notes. Es pot desfer amb «Desfés».`,
      `Eliminar ${tasks.length}`
    );
    if (!confirmed) return;

    const { deleted, skipped } = await this.actions.removeMany(tasks);
    this.renderer.clearSelection();
    undoableNotice(
      skipped === 0 ? `${deleted} tasques eliminades` : `${deleted} eliminades, ${skipped} omeses`,
      this.actions
    );
  }

  /**
   * Sequential on purpose: each write re-reads the file, so parallel edits would conflict.
   * The whole batch is one history entry, so undoing a bulk action is one step and not twenty.
   */
  private async bulk(tasks: Task[], run: (task: Task) => Promise<unknown>, label: string): Promise<void> {
    this.actions.beginGroup(`${label} · ${tasks.length} tasques`);
    let done = 0;
    let skipped = 0;
    try {
      for (const task of tasks) {
        const result = (await run(task)) as { ok?: boolean } | null;
        if (result && result.ok === false) skipped++;
        else done++;
      }
    } finally {
      this.actions.endGroup();
    }
    this.renderer.clearSelection();
    undoableNotice(
      skipped === 0 ? `${done} tasques actualitzades` : `${done} actualitzades, ${skipped} omeses`,
      this.actions
    );
  }
}

function nextFriday(today: Date = startOfToday()): Date {
  const delta = (5 - today.getDay() + 7) % 7;
  return addDays(today, delta === 0 ? 7 : delta);
}
