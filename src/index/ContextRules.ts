import type { TaskKind } from "../types/task";

/**
 * How a note's own frontmatter changes the meaning of the task lines inside it.
 *
 * All three lists are user-editable, because they encode a personal vault convention rather
 * than anything universal.
 */
export interface ContextRules {
  /**
   * Note markers — matched against the note's `tags` **or** its `tipus` — whose date is a
   * deadline for the tasks inside.
   *
   * Only periodic notes by default. A task jotted down in a meeting on 27 July is not "late
   * since 27 July": that date says when it was written, not when it is due. Applying it to
   * every note would have turned 15 of the 18 undated tasks into overdue ones overnight.
   */
  deadlineFrom: string[];
  /** `tipus` values whose task lines are documentation: kept, but out of every count. */
  referenceTypes: string[];
  /** `tipus` values whose task lines are someday/maybe rather than commitments. */
  somedayTypes: string[];
}

export const DEFAULT_CONTEXT_RULES: ContextRules = {
  deadlineFrom: ["Nota_Diaria", "Nota_Setmanal"],
  referenceTypes: ["documentacio"],
  somedayTypes: [],
};

/** True when this note lends its own `data:` to its tasks as a deadline. */
export function grantsDeadline(rules: ContextRules, tags: string[], type: string | null): boolean {
  const markers = new Set([...tags, ...(type ? [type] : [])].map(lower));
  return rules.deadlineFrom.some((wanted) => markers.has(lower(wanted)));
}

export function kindOf(rules: ContextRules, type: string | null): TaskKind {
  if (type === null) return "commitment";
  const value = lower(type);
  if (rules.referenceTypes.some((t) => lower(t) === value)) return "reference";
  if (rules.somedayTypes.some((t) => lower(t) === value)) return "someday";
  return "commitment";
}

function lower(text: string): string {
  return text.trim().toLowerCase();
}
