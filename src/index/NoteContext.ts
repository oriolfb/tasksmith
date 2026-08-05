import { parseIsoDate } from "./dates";

/** Frontmatter-derived context for the note a task lives in. */
export interface NoteContext {
  project: string | null;
  area: string | null;
  people: string[];
  title: string | null;
  type: string | null;
  date: Date | null;
  tags: string[];
}

/**
 * Project comes from `Projecte:` only. It is empty in about two thirds of the notes with open
 * tasks, which is why it is no longer an axis of the interface: `Persones`, `Àrea` and
 * `Disciplina` are the keys this vault actually fills in.
 */
export function projectOf(frontmatter: unknown): string | null {
  return first(pick(frontmatter, "Projecte"));
}

export function areaOf(frontmatter: unknown): string | null {
  return first(pick(frontmatter, "Àrea"));
}

/**
 * Everyone named in `Persones:`, wikilinks unwrapped. All of them, not just the first: a task
 * noted in a meeting with two people belongs on both agendas, so the per-person counts add up
 * to more than the number of tasks by design.
 */
export function peopleOf(frontmatter: unknown): string[] {
  return all(pick(frontmatter, "Persones"));
}

/** `title:` when the note has one — a readable name for the origin, unlike the filename. */
export function titleOf(frontmatter: unknown): string | null {
  return first(pick(frontmatter, "title"));
}

/** `tipus:` — `reunió`, `documentacio`, `projecte`, `idea` in this vault. */
export function typeOf(frontmatter: unknown): string | null {
  return first(pick(frontmatter, "tipus"));
}

/**
 * `data:` from the frontmatter. Obsidian may hand this over already parsed as a Date, or as a
 * `YYYY-MM-DD` string; both are accepted, anything else is ignored rather than guessed at.
 */
export function noteDateOf(frontmatter: unknown): Date | null {
  const value = pick(frontmatter, "data");
  if (value instanceof Date) {
    return Number.isNaN(value.getTime())
      ? null
      : new Date(value.getFullYear(), value.getMonth(), value.getDate());
  }
  const text = first(value);
  return text ? parseIsoDate(text.slice(0, 10)) : null;
}

/** `tags:` normalised without the leading `#`, whatever shape they were written in. */
export function tagsOf(frontmatter: unknown): string[] {
  return all(pick(frontmatter, "tags")).map((tag) => tag.replace(/^#/, ""));
}

/** Top-level folder of a vault-relative path, or null for a note at the vault root. */
export function topFolder(path: string): string | null {
  const slash = path.indexOf("/");
  return slash === -1 ? null : path.slice(0, slash);
}

function pick(frontmatter: unknown, key: string): unknown {
  if (!frontmatter || typeof frontmatter !== "object") return undefined;
  return (frontmatter as Record<string, unknown>)[key];
}

/** Frontmatter values may be a string, a wikilink, or a list of either. */
function first(value: unknown): string | null {
  return all(value)[0] ?? null;
}

function all(value: unknown): string[] {
  if (typeof value === "string") {
    const cleaned = clean(value);
    return cleaned ? [cleaned] : [];
  }
  if (Array.isArray(value)) {
    const out: string[] = [];
    for (const entry of value) out.push(...all(entry));
    return out;
  }
  return [];
}

function clean(text: string): string | null {
  const stripped = text.trim().replace(/^\[\[(.+?)(?:\|.*)?\]\]$/, "$1").trim();
  return stripped.length > 0 ? stripped : null;
}
