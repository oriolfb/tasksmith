import { type App, Modal } from "obsidian";
import type { TaskIndex } from "../index/TaskIndex";
import { startOfToday } from "../index/dates";
import { deserializeTaskCache } from "../index/TaskCache";
import {
  dayPlannerCandidates,
  dayPlannerDataSource,
  dayPlannerStage,
  type DayPlannerCandidate,
} from "../query/DayPlanner";
import { DAY_LIMIT, dayKey } from "../query/Focus";
import type { TaskSmithSettings } from "../settings/Config";
import type { TaskActions } from "../tasks/TaskActions";
import type { Task } from "../types/task";
import { t } from "../i18n/strings";
import { ConfirmModal } from "./ConfirmModal";
import { DateInputModal } from "./DateInputModal";
import { nextMonday } from "./DateMenu";
import { noteName, relativeLabel } from "./format";
import { DaySelection } from "./DaySelection";

/**
 * A deliberate planning session outside the dock. It protects at most three tasks for today,
 * then optionally keeps going through the unresolved backlog without pretending a fourth task
 * can still fit in today's plan.
 */
export class DayPlannerModal extends Modal {
  private readonly day: DaySelection;
  private unsubscribe: (() => void) | null = null;
  private planningRest = false;
  private choosingReplacement = false;
  private readonly skippedToday = new Set<string>();
  private readonly decidedRest = new Set<string>();
  private reviewedRest = 0;
  private status = "";

  constructor(
    app: App,
    private readonly index: TaskIndex,
    private readonly actions: TaskActions,
    private readonly settings: TaskSmithSettings,
    private readonly persist: () => Promise<void>,
    private readonly onPlanChanged: () => void
  ) {
    super(app);
    this.day = new DaySelection(settings.dayPlan, (plan) => {
      this.settings.dayPlan = plan;
      this.onPlanChanged();
      void this.persist();
    });
  }

  onOpen(): void {
    this.titleEl.setText(t("planner.title"));
    this.modalEl.addClass("tsp-modal");
    this.contentEl.addClass("tsp");
    this.unsubscribe = this.index.onChange(() => this.render());
    this.render();
  }

  onClose(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.modalEl.removeClass("tsp-modal");
    this.contentEl.removeClass("tsp");
  }

  private render(): void {
    this.contentEl.empty();
    const source = dayPlannerDataSource(
      this.index.ready,
      this.index.all(),
      this.index.ready ? null : deserializeTaskCache(this.settings.taskCache)
    );
    if (!source) {
      this.contentEl.createDiv({ cls: "tsp-loading", text: t("planner.loading") });
      return;
    }

    const today = startOfToday();
    const all = source.tasks;
    this.day.refresh(today);
    if (source.live) this.day.prune(all, today);
    if (this.day.size < DAY_LIMIT) this.planningRest = false;

    const root = this.contentEl.createDiv({ cls: "tsp-shell" });
    root.toggleClass("tsp-changing", this.choosingReplacement);
    this.renderPlan(root.createEl("aside", { cls: "tsp-plan" }), all);

    const conversation = root.createEl("main", { cls: "tsp-conversation" });
    const stage = dayPlannerStage(this.day.size, this.planningRest);
    this.renderAssistant(conversation, stage, all, today);

    if (stage === "day-ready") this.renderDayReady(conversation);
    else this.renderCandidate(conversation, all, today, stage === "planning-rest");

    const status = conversation.createDiv({ cls: "tsp-status", attr: { "aria-live": "polite" } });
    status.createSpan({ text: this.status });
  }

  private renderPlan(host: HTMLElement, all: Task[]): void {
    host.createDiv({ cls: "tsp-overline", text: t("planner.yourPlan") });
    host.createEl("h2", { text: t("planner.count", { count: this.day.size, limit: DAY_LIMIT }) });
    host.createEl("p", { cls: "tsp-plan-hint", text: t("planner.limitHint") });

    const byKey = new Map(all.map((task) => [dayKey(task), task]));
    const chosen = this.day.keys().map((key) => byKey.get(key)).filter((task): task is Task => task !== undefined);

    for (let index = 0; index < DAY_LIMIT; index++) {
      const task = chosen[index];
      const row = host.createDiv({ cls: `tsp-slot${task ? "" : " tsp-slot-empty"}` });
      row.createSpan({ cls: "tsp-slot-number", text: String(index + 1) });
      const copy = row.createDiv({ cls: "tsp-slot-copy" });
      copy.createDiv({ text: task?.description ?? t("planner.emptySlot") });
      if (task) copy.createDiv({ cls: "tsp-slot-meta", text: this.context(task) });
      if (task) {
        const remove = row.createEl("button", { cls: "clickable-icon tsp-slot-remove", text: "×" });
        remove.setAttribute("aria-label", t("planner.remove", { task: task.description }));
        remove.addEventListener("click", () => {
          this.day.remove(task);
          this.planningRest = false;
          this.choosingReplacement = false;
          this.status = t("planner.removed");
          this.render();
        });
      }
    }

    host.createEl("p", { cls: "tsp-plan-foot", text: t("planner.finishAnytime") });
  }

  private renderAssistant(
    host: HTMLElement,
    stage: ReturnType<typeof dayPlannerStage>,
    all: Task[],
    today: Date
  ): void {
    const assistant = host.createDiv({ cls: "tsp-assistant" });
    assistant.createSpan({ cls: "tsp-mark", text: "T" });
    const copy = assistant.createEl("p");
    if (stage === "day-ready") copy.setText(t("planner.readyIntro"));
    else if (stage === "planning-rest") copy.setText(t("planner.restIntro"));
    else {
      const unresolved = dayPlannerCandidates(all, this.day.keys(), [], today).length;
      copy.setText(t("planner.intro", { count: unresolved }));
    }
  }

  private renderDayReady(host: HTMLElement): void {
    const ready = host.createDiv({ cls: "tsp-ready" });
    ready.createDiv({ cls: "tsp-ready-mark", text: "✓" });
    ready.createEl("h2", { text: t("planner.readyTitle") });
    ready.createEl("p", { text: t("planner.readyBody") });
    const buttons = ready.createDiv({ cls: "tsp-actions tsp-actions-centred" });
    this.button(buttons, t("planner.startDay"), "mod-cta", () => this.close());
    this.button(buttons, t("planner.planRest"), "", () => {
      this.planningRest = true;
      this.choosingReplacement = false;
      this.status = "";
      this.render();
    });
    this.button(buttons, t("planner.changeTask"), "", () => {
      this.choosingReplacement = true;
      this.status = t("planner.chooseRemove");
      this.render();
    });
  }

  private renderCandidate(host: HTMLElement, all: Task[], today: Date, rest: boolean): void {
    const decided = rest ? [...this.decidedRest] : [...this.skippedToday];
    const candidates = dayPlannerCandidates(all, this.day.keys(), decided, today);
    const candidate = candidates[0];

    if (!candidate) {
      const empty = host.createDiv({ cls: "tsp-ready" });
      empty.createDiv({ cls: "tsp-ready-mark", text: "✓" });
      empty.createEl("h2", { text: t(rest ? "planner.restDoneTitle" : "planner.emptyTitle") });
      empty.createEl("p", { text: t(rest ? "planner.restDoneBody" : "planner.emptyBody") });
      this.button(empty.createDiv({ cls: "tsp-actions tsp-actions-centred" }), t("planner.startDay"), "mod-cta", () =>
        this.close()
      );
      return;
    }

    const card = host.createEl("article", { cls: "tsp-proposal" });
    card.createDiv({ cls: "tsp-reason", text: t(`planner.reason.${candidate.reason}`) });
    card.createEl("h2", { text: candidate.task.description });
    const metadata = card.createDiv({ cls: "tsp-meta" });
    metadata.createSpan({ text: relativeLabel(candidate.task.effectiveDate ?? candidate.task.noteDate, today) });
    for (const person of candidate.task.people) metadata.createSpan({ text: person });
    metadata.createSpan({ text: this.source(candidate.task) });
    card.createEl("p", { cls: "tsp-why", text: this.explanation(candidate) });

    const buttons = card.createDiv({ cls: "tsp-actions" });
    if (rest) this.renderRestActions(buttons, candidate.task, today);
    else this.renderTodayActions(buttons, candidate.task, today);

    const footer = host.createDiv({ cls: "tsp-footer" });
    footer.createSpan({
      text: rest
        ? t("planner.restProgress", { done: this.reviewedRest, count: candidates.length + this.reviewedRest })
        : t("planner.progress", { count: candidates.length }),
    });
    const line = footer.createSpan({ cls: "tsp-footer-line" });
    line.setAttribute("aria-hidden", "true");
    this.button(footer, t(rest ? "planner.finishReview" : "planner.finishNow"), "tsp-finish", () => this.close());
  }

  private renderTodayActions(host: HTMLElement, task: Task, today: Date): void {
    this.button(host, t("planner.addToday"), "mod-cta", () => {
      if (!this.day.add(task, today)) return;
      this.status = t("planner.addedToday");
      this.render();
    });
    this.button(host, t("planner.complete"), "", () => void this.complete(task, false));
    this.button(host, t("planner.another"), "", () => {
      this.skippedToday.add(dayKey(task));
      this.status = "";
      this.render();
    });
    this.button(host, t("planner.anotherDay"), "", () => void this.pickDate(task, today, false));
    this.button(host, t("dateMenu.wontDo"), "tsp-danger", () => void this.cancel(task, false));
  }

  private renderRestActions(host: HTMLElement, task: Task, today: Date): void {
    this.button(host, t("dateMenu.tomorrow"), "mod-cta", () => void this.schedule(task, () => this.actions.tomorrow(task)));
    this.button(host, t("dateMenu.nextMonday"), "", () =>
      void this.schedule(task, () => this.actions.scheduleOn(task, nextMonday(today)))
    );
    this.button(host, t("dateMenu.writeDate"), "", () => void this.pickDate(task, today, true));
    this.button(host, t("planner.complete"), "", () => void this.complete(task, true));
    this.button(host, t("dateMenu.wontDo"), "tsp-danger", () => void this.cancel(task, true));
  }

  private async pickDate(task: Task, today: Date, rest: boolean): Promise<void> {
    const date = await DateInputModal.ask(this.app, today);
    if (!date) return;
    await this.schedule(task, () => this.actions.scheduleOn(task, date), rest);
  }

  private async schedule(task: Task, write: () => ReturnType<TaskActions["scheduleOn"]>, rest = true): Promise<void> {
    const result = await write();
    if (!result.ok) return;
    this.decided(task, rest);
    this.status = t("planner.dated");
    this.render();
  }

  private async cancel(task: Task, rest: boolean): Promise<void> {
    const confirmed = await ConfirmModal.ask(
      this.app,
      t("planner.cancelTitle"),
      t("planner.cancelBody", { task: task.description }),
      t("planner.cancelConfirm")
    );
    if (!confirmed) return;
    const result = await this.actions.cancel(task);
    if (!result.ok) return;
    this.decided(task, rest);
    this.status = t("planner.cancelled");
    this.render();
  }

  private async complete(task: Task, rest: boolean): Promise<void> {
    const result = await this.actions.complete(task);
    if (!result?.ok) return;
    this.decided(task, rest);
    this.status = t("planner.completed");
    this.render();
  }

  private decided(task: Task, rest: boolean): void {
    const target = rest ? this.decidedRest : this.skippedToday;
    target.add(dayKey(task));
    if (rest) this.reviewedRest++;
  }

  private explanation(candidate: DayPlannerCandidate): string {
    return t(`planner.explanation.${candidate.reason}`, {
      age: relativeLabel(candidate.task.effectiveDate ?? candidate.task.noteDate),
      source: this.source(candidate.task),
    });
  }

  private context(task: Task): string {
    return [relativeLabel(task.effectiveDate ?? task.noteDate), ...task.people.slice(0, 1)].join(" · ");
  }

  private source(task: Task): string {
    return task.noteTitle ?? noteName(task.location.path);
  }

  private button(host: HTMLElement, label: string, cls: string, run: () => void): HTMLButtonElement {
    const button = host.createEl("button", { text: label, cls });
    button.addEventListener("click", run);
    return button;
  }
}
