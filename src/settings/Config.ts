import type { QueryState } from "../query/Query";
import { DEFAULT_CONTEXT_RULES, type ContextRules } from "../index/ContextRules";

export interface SavedView {
  name: string;
  query: QueryState;
}

export interface TaskConsoleSettings {
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
}

export const DEFAULT_SETTINGS: TaskConsoleSettings = {
  savedViews: [],
  excludedFolders: ["96 IA Docs", "07 Arxiu", ".claude", ".agents"],
  respectObsidianIgnoreFilters: true,
  staleThresholdDays: 14,
  showOverdueBadge: true,
  autoDeleteEmptyTasks: false,
  deadlineFromNotes: [...DEFAULT_CONTEXT_RULES.deadlineFrom],
  referenceNoteTypes: [...DEFAULT_CONTEXT_RULES.referenceTypes],
  somedayNoteTypes: [...DEFAULT_CONTEXT_RULES.somedayTypes],
};

export function contextRulesOf(settings: TaskConsoleSettings): ContextRules {
  return {
    deadlineFrom: settings.deadlineFromNotes,
    referenceTypes: settings.referenceNoteTypes,
    somedayTypes: settings.somedayNoteTypes,
  };
}
