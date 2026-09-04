/**
 * What the plugin wrote, so it can be un-written.
 *
 * One record is one line of one file. `before === null` means the line did not exist (an
 * insertion); `after === null` means the line was removed. Every record in an entry refers
 * to line numbers from the *same* index snapshot, which is what makes an entry reversible as
 * a unit — see `TaskWriter.undo`.
 */
export interface WriteRecord {
  path: string;
  /** 0-based line number in the file as it was when the write started. */
  line: number;
  before: string | null;
  after: string | null;
  /** Neighbouring lines used to safely relocate a deletion if line numbers later move. */
  anchorBefore?: string | null;
  anchorAfter?: string | null;
}

export interface HistoryEntry {
  /** Shown to the user: "Eliminar 3 tasques", "Data", "Completar". */
  label: string;
  records: WriteRecord[];
}

/**
 * A bounded ring of write entries. Bounded because this is an undo affordance, not an audit
 * log: fifty steps is far more than the "oops" window it exists to cover.
 */
export class History {
  private entries: HistoryEntry[] = [];
  /** Open group, so a bulk action of twenty writes is one undo, not twenty. */
  private group: HistoryEntry | null = null;

  constructor(private readonly limit = 50) {}

  /** Starts grouping. Every record until `commit` lands in the same entry. */
  begin(label: string): void {
    this.commit();
    this.group = { label, records: [] };
  }

  commit(): void {
    const group = this.group;
    this.group = null;
    if (group && group.records.length > 0) this.push(group);
  }

  record(label: string, records: WriteRecord[]): void {
    if (records.length === 0) return;
    if (this.group) {
      this.group.records.push(...records);
      return;
    }
    this.push({ label, records });
  }

  /** Removes and returns the newest entry. */
  pop(): HistoryEntry | null {
    return this.entries.pop() ?? null;
  }

  /** Label of the newest entry, for the "Desfés X" affordance. */
  peekLabel(): string | null {
    return this.entries[this.entries.length - 1]?.label ?? null;
  }

  get size(): number {
    return this.entries.length;
  }

  clear(): void {
    this.entries = [];
    this.group = null;
  }

  private push(entry: HistoryEntry): void {
    this.entries.push(entry);
    if (this.entries.length > this.limit) this.entries.shift();
  }
}
