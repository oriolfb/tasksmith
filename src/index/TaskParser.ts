import type { FieldKey, ParsedTask, Priority, TaskField } from "../types/task";
import { parseIsoDate } from "./dates";

/**
 * Indentation is `\s`, not `[ \t]`: this vault contains a task indented with EM SPACE
 * (U+2003) that the Tasks plugin sees and a narrower regex would silently drop. Blockquote
 * prefixes and numbered lists are accepted for the same reason — a task the index cannot
 * see is the exact failure mode this plugin exists to remove.
 */
const LIST_ITEM = /^([\s>]*)([-*+]|\d+[.)])\s\[(.)\]/;

/** Every marker the parser knows, used as a negative class when reading free-text values. */
const ALL_MARKERS = ["📅", "📆", "🗓", "⏳", "⌛", "🛫", "✅", "❌", "➕", "🔺", "⏫", "🔼", "🔽", "⏬", "🆔", "⛔", "🏁"];

const PRIORITY_BY_MARKER: Record<string, Priority> = {
  "🔺": "highest",
  "⏫": "high",
  "🔼": "medium",
  "🔽": "low",
  "⏬": "lowest",
};

type FieldKind = "date" | "text" | "flag";

interface FieldSpec {
  key: FieldKey;
  markers: string[];
  kind: FieldKind;
}

const FIELD_SPECS: FieldSpec[] = [
  { key: "due", markers: ["📅", "📆", "🗓"], kind: "date" },
  { key: "scheduled", markers: ["⏳", "⌛"], kind: "date" },
  { key: "start", markers: ["🛫"], kind: "date" },
  { key: "done", markers: ["✅"], kind: "date" },
  { key: "cancelled", markers: ["❌"], kind: "date" },
  { key: "created", markers: ["➕"], kind: "date" },
  { key: "recurrence", markers: ["🔁"], kind: "text" },
  { key: "id", markers: ["🆔"], kind: "text" },
  { key: "dependsOn", markers: ["⛔"], kind: "text" },
  { key: "onCompletion", markers: ["🏁"], kind: "text" },
  { key: "priority", markers: Object.keys(PRIORITY_BY_MARKER), kind: "flag" },
];

const NOT_MARKER = `[^${ALL_MARKERS.join("")}]`;

interface CompiledPattern {
  key: FieldKey;
  marker: string;
  kind: FieldKind;
  re: RegExp;
}

const PATTERNS: CompiledPattern[] = FIELD_SPECS.flatMap((spec) =>
  spec.markers.map((marker) => {
    const value =
      spec.kind === "date" ? `\\d{4}-\\d{2}-\\d{2}` : spec.kind === "text" ? `${NOT_MARKER}+?` : ``;
    // Leading whitespace is part of the match so removing a field leaves no double space.
    const source = spec.kind === "flag" ? `[ \\t]*${marker}[ \\t]*$` : `[ \\t]*${marker}[ \\t]*(${value})[ \\t]*$`;
    return { key: spec.key, marker, kind: spec.kind, re: new RegExp(source, "u") };
  })
);

const TAG = /(^|\s)(#[^\s#.,;:!?'"`()[\]{}]+)/gu;
const WIKILINK = /\[\[([^\][|]+)(?:\|[^\][]*)?\]\]/gu;

export function isTaskLine(line: string): boolean {
  return LIST_ITEM.test(line);
}

/** Returns null when the line is not a markdown task item. */
export function parseTaskLine(raw: string): ParsedTask | null {
  const head = LIST_ITEM.exec(raw);
  if (!head) return null;

  const indent = head[1] ?? "";
  const bullet = head[2] ?? "-";
  const status = head[3] ?? " ";
  const bodyStart = head[0].length;
  const statusOffset = bodyStart - 2; // the match ends with "]", status sits just before it

  const fields: Partial<Record<FieldKey, TaskField>> = {};
  let rest = raw.slice(bodyStart);

  // Fields are consumed from the end of the line, one at a time, so offsets of
  // everything to the left stay valid in `raw` coordinates.
  for (;;) {
    let best: { pattern: CompiledPattern; match: RegExpExecArray } | null = null;
    for (const pattern of PATTERNS) {
      if (fields[pattern.key]) continue;
      const match = pattern.re.exec(rest);
      if (!match) continue;
      if (!best || match.index > best.match.index) best = { pattern, match };
    }
    if (!best) break;

    const { pattern, match } = best;
    const value = pattern.kind === "flag" ? pattern.marker : (match[1] ?? "").trim();
    fields[pattern.key] = {
      key: pattern.key,
      marker: pattern.marker,
      value,
      date: pattern.kind === "date" ? parseIsoDate(value) : null,
      span: { start: bodyStart + match.index, end: bodyStart + rest.length },
    };
    rest = rest.slice(0, match.index);
  }

  const description = rest.trim();

  return {
    raw,
    indent,
    bullet,
    status,
    statusOffset,
    description,
    bodySpan: { start: bodyStart, end: bodyStart + rest.length },
    fields,
    tags: collect(TAG, description, 2),
    links: collect(WIKILINK, description, 1),
  };
}

export function priorityOf(task: ParsedTask): Priority | null {
  const field = task.fields.priority;
  return field ? PRIORITY_BY_MARKER[field.marker] ?? null : null;
}

export function markerForPriority(priority: Priority): string {
  const entry = Object.entries(PRIORITY_BY_MARKER).find(([, value]) => value === priority);
  return entry ? entry[0] : "";
}

export const MARKERS: Readonly<Record<FieldKey, string>> = {
  due: "📅",
  scheduled: "⏳",
  start: "🛫",
  done: "✅",
  cancelled: "❌",
  created: "➕",
  recurrence: "🔁",
  priority: "⏫",
  id: "🆔",
  dependsOn: "⛔",
  onCompletion: "🏁",
};

function collect(re: RegExp, text: string, group: number): string[] {
  const out: string[] = [];
  re.lastIndex = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    const value = m[group];
    if (value) out.push(value.trim());
  }
  return out;
}
