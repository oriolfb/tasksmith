import type { QueryState } from "../query/Query";
import { DEFAULT_CONTEXT_RULES, type ContextRules } from "../index/ContextRules";
import { EMPTY_PLAN, type DayPlan } from "../views/DaySelection";

export interface SavedView {
  name: string;
  query: QueryState;
}

export interface TaskSmithSettings {
  /** Named query presets, editable from the triage view. */
  savedViews: SavedView[];
  /** Folders excluded from indexing, on top of Obsidian's own ignore filters. */
  excludedFolders: string[];
  /** Also honour `userIgnoreFilters` from `.obsidian/app.json`. */
  respectObsidianIgnoreFilters: boolean;
  /** Days after which an open task counts as stale. */
  staleThresholdDays: number;
  /** Show the count of overdue tasks on the ribbon icon. */
  showOverdueBadge: boolean;
  /**
   * Delete template leftovers (`- [ ]` with nothing on it) outside the active note.
   * Off by default: writing to notes nobody asked about needs opting in, not out.
   */
  autoDeleteEmptyTasks: boolean;
  /** Note tags or `tipus` values whose own `data:` is a deadline for the tasks inside. */
  deadlineFromNotes: string[];
  /** `tipus` values whose task lines are documentation, kept but outside every count. */
  referenceNoteTypes: string[];
  /** `tipus` values whose task lines are someday/maybe. */
  somedayNoteTypes: string[];
  /**
   * Today's chosen tasks, stamped with the day. Lives here and not in the notes, so an
   * unfinished day expires instead of becoming a backlog of overdue tasks.
   */
  dayPlan: DayPlan;
  /** Sections the user folded away, remembered between sessions. */
  collapsedSections: string[];
  /**
   * Whether the control centre's history panel is unfolded. Its own flag and not a
   * `collapsedSections` entry, because this one is closed until asked for: a list of what the
   * user folded cannot express "folded unless you opened it once".
   */
  showHistory: boolean;
  /**
   * Whether the control centre's health panel is unfolded.
   *
   * Three states and not a boolean, because the honest default depends on where the panel is:
   * as the right-hand rail it costs nothing and stays open, stacked under the table on a narrow
   * tab it would sit below every row and it starts folded. `auto` is that rule; the other two are
   * the user having decided, which outranks the rule at any width.
   */
  healthPanel: "auto" | "open" | "closed";
  /**
   * Whether the week strip gives Saturday and Sunday a column of their own.
   *
   * Off, the strip runs over the next seven **working** days and a task dated on a weekend is
   * counted in the Monday that follows it — folded, never dropped. The column says so in its
   * tooltip and clicking it filters the table to all the days it stands for, so the number and
   * the list it opens can never disagree.
   */
  showWeekends: boolean;
}

export const DEFAULT_SETTINGS: TaskSmithSettings = {
  savedViews: [],
  excludedFolders: ["96 IA Docs", "07 Arxiu", ".claude", ".agents"],
  respectObsidianIgnoreFilters: true,
  staleThresholdDays: 14,
  showOverdueBadge: true,
  autoDeleteEmptyTasks: false,
  deadlineFromNotes: [...DEFAULT_CONTEXT_RULES.deadlineFrom],
  referenceNoteTypes: [...DEFAULT_CONTEXT_RULES.referenceTypes],
  somedayNoteTypes: [...DEFAULT_CONTEXT_RULES.somedayTypes],
  dayPlan: EMPTY_PLAN,
  collapsedSections: [],
  showHistory: false,
  healthPanel: "auto",
  showWeekends: true,
};

export function contextRulesOf(settings: TaskSmithSettings): ContextRules {
  return {
    deadlineFrom: settings.deadlineFromNotes,
    referenceTypes: settings.referenceNoteTypes,
    somedayTypes: settings.somedayNoteTypes,
  };
}
