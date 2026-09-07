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
    /** Repaints the other views. Called for every write, not only when the plan itself moves. */
    private readonly refreshViews: () => void
  ) {
    super(app);
    this.day = new DaySelection(settings.dayPlan, (plan) => {
      this.settings.dayPlan = plan;
      this.refreshViews();
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
    // Same reason the dock adopts: `settings.dayPlan` is the shared truth, and the dock's own
    // `prune` can persist a new one while this modal is open (an index change from a sync, say).
    // Writing from a snapshot taken at construction would put pruned keys back.
    this.day.adopt(this.settings.dayPlan, today);
    this.day.refresh(today);
    if (source.live) this.day.prune(all, today);
    if (this.day.size < DAY_LIMIT) this.planningRest = false;

    const root = this.contentEl.createDiv({ cls: "tsp-shell" });
    root.toggleClass("tsp-changing", this.choosingReplacement);
    this.renderPlan(root.createEl("aside", { cls: "tsp-plan" }), all);

    const conversation = root.createEl("main", { cls: "tsp-conversation" });
    const stage = dayPlannerStage(this.day.size, this.planningRest);
    // Computed once and shared: the opening line and the footer are two readings of the same
    // queue, and they disagreed — the intro ignored what you had already skipped, so it kept
    // claiming three tasks needed a decision while the footer counted down to one.
    const rest = stage === "planning-rest";
    const candidates = dayPlannerCandidates(
      all,
      this.day.keys(),
      rest ? [...this.decidedRest] : [...this.skippedToday],
      today
    );
    this.renderAssistant(conversation, stage, candidates.length);

    if (stage === "day-ready") this.renderDayReady(conversation);
    else this.renderCandidate(conversation, candidates, today, rest);

    const status = conversation.createDiv({ cls: "tsp-status", attr: { "aria-live": "polite" } });
    status.createSpan({ text: this.status });
  }

  private renderPlan(host: HTMLElement, all: Task[]): void {
    host.createDiv({ cls: "tsp-overline", text: t("planner.yourPlan") });
    host.createEl("h2", { text: t("planner.count", { count: this.day.size, limit: DAY_LIMIT }) });
    host.createEl("p", { cls: "tsp-plan-hint", text: t("planner.limitHint") });

    const byKey = new Map(all.map((task) => [dayKey(task), task]));
    /*
     * A key the snapshot has no task for keeps its slot and its text. The plan is not pruned
     * against an index that has not finished its first scan — rightly, that is how a day's picks
     * used to vanish on startup — so those seconds would otherwise paint a numbered slot as
     * "Encara lliure" while the counter above says it is taken. The description is recovered from
     * the key itself; there is nothing else to show, and it is the half the user recognises.
     */
    const chosen = this.day.keys().map((key) => ({ key, task: byKey.get(key) }));

    for (let index = 0; index < DAY_LIMIT; index++) {
      const slot = chosen[index];
      const task = slot?.task;
      const label = task?.description ?? (slot ? descriptionOf(slot.key) : t("planner.emptySlot"));
      const row = host.createDiv({ cls: `tsp-slot${slot ? "" : " tsp-slot-empty"}` });
      row.createSpan({ cls: "tsp-slot-number", text: String(index + 1) });
      const copy = row.createDiv({ cls: "tsp-slot-copy" });
      copy.createDiv({ text: label });
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
    unresolved: number
  ): void {
    const assistant = host.createDiv({ cls: "tsp-assistant" });
    assistant.createSpan({ cls: "tsp-mark", text: "T" });
    const copy = assistant.createEl("p");
    if (stage === "day-ready") copy.setText(t("planner.readyIntro"));
    else if (stage === "planning-rest") copy.setText(t("planner.restIntro"));
    else copy.setText(t("planner.intro", { count: unresolved }));
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

  private renderCandidate(
    host: HTMLElement,
    candidates: DayPlannerCandidate[],
    today: Date,
    rest: boolean
  ): void {
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
      // Unreachable while the stage gate holds — three picks replace this card with "day ready"
      // — but a button that can fail has to say so, the way the dock's own «Avui» does.
      this.status = this.day.add(task, today)
        ? t("planner.addedToday")
        : t("notice.dayLimitReached", { limit: DAY_LIMIT });
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
    this.wrote(task, rest, t("planner.dated"));
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
    this.wrote(task, rest, t("planner.cancelled"));
  }

  private async complete(task: Task, rest: boolean): Promise<void> {
    const result = await this.actions.complete(task);
    if (!result?.ok) return;
    // Ticked off inside a planning session, so it counts as work done today: without this the
    // line just left the queue and the dock's "Fetes avui" never heard about it, which reads as
    // a day where the task was never there at all.
    this.day.markDone(task);
    this.wrote(task, rest, t("planner.completed"));
  }

  /**
   * One landing for every write: mark the task decided, tell the other views, repaint here.
   *
   * The dock's own refresh only ever fired when the *plan* was persisted, so dating or
   * cancelling a task from here left it painting rows the note no longer agrees with until
   * Obsidian's metadata event happened to arrive. Asking for the repaint costs one render and
   * removes the wait entirely.
   */
  private wrote(task: Task, rest: boolean, status: string): void {
    this.decided(task, rest);
    this.status = status;
    this.refreshViews();
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

/** The task half of a `dayKey` (`path|description`), for a slot the index cannot resolve yet. */
function descriptionOf(key: string): string {
  return key.slice(key.indexOf("|") + 1);
}
