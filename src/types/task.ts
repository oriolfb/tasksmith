export type FieldKey =
  | "due"
  | "scheduled"
  | "start"
  | "done"
  | "cancelled"
  | "created"
  | "recurrence"
  | "priority"
  | "id"
  | "dependsOn"
  | "onCompletion";

export type Priority = "highest" | "high" | "medium" | "low" | "lowest";

/** Half-open offset range `[start, end)` into `ParsedTask.raw`. */
export interface Span {
  start: number;
  end: number;
}

export interface TaskField {
  key: FieldKey;
  /** Marker emoji as written in the line. */
  marker: string;
  /** Raw text after the marker, trimmed. Empty when the marker has no value. */
  value: string;
  /** `YYYY-MM-DD` parsed to a local-midnight Date; null for date fields with an unusable value. */
  date: Date | null;
  /** Covers marker + value + the whitespace that separated it from what precedes it. */
  span: Span;
}

/**
 * A single markdown task line. `raw` is kept verbatim so every edit can be applied
 * surgically via spans — anything the parser does not model survives byte-for-byte.
 */
export interface ParsedTask {
  raw: string;
  /** Leading whitespace (spaces or tabs) of the list item. */
  indent: string;
  /** List marker: `-`, `*` or `+`. */
  bullet: string;
  /** The character between the brackets. `" "` for an open task. */
  status: string;
  /** Offset of the status character inside `raw`. */
  statusOffset: number;
  /** Description with all recognised fields, tags and links stripped out. */
  description: string;
  /** Span of the description region (from after `] ` to end of line). */
  bodySpan: Span;
  fields: Partial<Record<FieldKey, TaskField>>;
  tags: string[];
  links: string[];
}

export interface TaskLocation {
  /** Vault-relative path of the note holding the task. */
  path: string;
  /** 0-based line number. */
  line: number;
}

export type Bucket = "overdue" | "today" | "week" | "nextWeek" | "month" | "later" | "undated" | "closed";

/**
 * What a task line actually is, decided by the host note's `tipus`. A checklist inside a
 * documentation note is not a commitment and never gets completed, so it stays out of the
 * counts instead of inflating them.
 */
export type TaskKind = "commitment" | "reference" | "someday";

export interface Task extends ParsedTask {
  location: TaskLocation;
  /** Resolved from `Projecte:` in the host note's frontmatter; null when absent or empty. */
  project: string | null;
  /** Top-level folder of the host note, for grouping. */
  area: string | null;
  /** Everyone in the note's `Persones:`. A task can belong on several agendas. */
  people: string[];
  /** The note's `title:`, for a readable origin chip; null falls back to the filename. */
  noteTitle: string | null;
  /** The note's `tipus:`. */
  noteType: string | null;
  /** The note's own `data:`, whether or not it counts as a deadline. */
  noteDate: Date | null;
  /** Date implied by the note's filename, when the vault convention applies. */
  filenameDate: Date | null;
  /** due ?? scheduled ?? start ?? filenameDate ?? noteDate (when the note lends it) ?? null */
  effectiveDate: Date | null;
  kind: TaskKind;
  /** True when the status maps to TODO or IN_PROGRESS. */
  open: boolean;
  priority: Priority | null;
  /** True when the next non-blank line is more deeply indented, i.e. this task owns sub-items. */
  hasChildren: boolean;
}
