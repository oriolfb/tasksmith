import { type App, SuggestModal } from "obsidian";
import { type DateMatch, parseDateInput } from "../query/DateInput";
import { startOfToday } from "../index/dates";
import { dayWithAge } from "./format";
import { t } from "../i18n/strings";

/**
 * The date field: type a phrase, see what it means, press `↵`.
 *
 * All the reading is in `DateInput.ts`; this is the twenty lines that put it on screen. It is a
 * `SuggestModal` and not a text field of our own for the same reason `PickModal` is: the public
 * API already has a searchable, keyboard-first list that looks native, and the matches under the
 * field are exactly what it draws.
 *
 * Every row says the reading *and* the day it lands on, because the whole point of listing them
 * is that you see the date before it is written to the note.
 */
export class DateInputModal extends SuggestModal<DateMatch> {
  private settled = false;

  private constructor(
    app: App,
    private readonly today: Date,
    private readonly resolve: (date: Date | null) => void
  ) {
    super(app);
    // Above anything a phrase can produce — `d` alone is nine readings before duplicates go, and
    // a match the field decided not to show is a date you cannot reach.
    this.limit = 12;
    this.setPlaceholder(t("dateInput.placeholder"));
    this.emptyStateText = t("dateInput.empty");
    this.setInstructions([
      { command: "↵", purpose: t("dateInput.instructionSet") },
      { command: "esc", purpose: t("dateInput.instructionLeave") },
    ]);
  }

  static ask(app: App, today: Date = startOfToday()): Promise<Date | null> {
    return new Promise((resolve) => new DateInputModal(app, today, resolve).open());
  }

  getSuggestions(query: string): DateMatch[] {
    return parseDateInput(query, this.today);
  }

  renderSuggestion(match: DateMatch, el: HTMLElement): void {
    // Obsidian's own suggestion classes, so the list matches the quick switcher for free.
    el.addClass("mod-complex");
    const content = el.createDiv({ cls: "suggestion-content" });
    content.createDiv({ cls: "suggestion-title", text: match.label });
    content.createDiv({ cls: "suggestion-note", text: dayWithAge(match.date, this.today) });
  }

  onChooseSuggestion(match: DateMatch): void {
    this.settle(match.date);
  }

  /**
   * Cancelling cannot answer here and now. `SuggestModal.selectSuggestion` calls `close()` — which
   * runs `onClose()` on the spot on desktop — and only *then* `onChooseSuggestion`, so resolving
   * null from here would answer "cancelled" a beat before being told what was picked, and the date
   * would be lost with no error anywhere. A microtask is enough: the choice is synchronous, so it
   * always settles first, whichever order the platform closes in.
   */
  onClose(): void {
    queueMicrotask(() => this.settle(null));
  }

  private settle(date: Date | null): void {
    if (this.settled) return;
    this.settled = true;
    this.resolve(date);
  }
}
