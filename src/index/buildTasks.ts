import type { Task } from "../types/task";
import type { TasksInterop } from "../tasks/TasksPluginSettings";
import { isOpenStatus } from "../tasks/TasksPluginSettings";
import { effectiveDate } from "./Buckets";
import { filenameDate } from "./FilenameDate";
import { parseFrontmatterBlock } from "./Frontmatter";
import { DEFAULT_CONTEXT_RULES, grantsDeadline, kindOf, type ContextRules } from "./ContextRules";
import { areaOf, noteDateOf, peopleOf, projectOf, tagsOf, titleOf, topFolder, typeOf } from "./NoteContext";
import { extractPersonPrefix } from "./PersonPrefix";
import { parseTaskLine, priorityOf } from "./TaskParser";

export interface FileInput {
  /** Vault-relative path including the `.md` extension. */
  path: string;
  content: string;
  /**
   * Parsed frontmatter. Obsidian supplies it in the plugin; when it is omitted the block is
   * read from `content` so the vault audit test sees the same context the UI does.
   */
  frontmatter?: unknown;
}

/**
 * The single parsing path, shared by the live index and the vault audit test, so the
 * numbers the plugin shows and the numbers we verify can never come from different code.
 */
export function tasksFromFile(
  file: FileInput,
  interop: TasksInterop,
  rules: ContextRules = DEFAULT_CONTEXT_RULES,
  knownPeople: ReadonlySet<string> = new Set()
): Task[] {
  const lines = file.content.split("\n");
  const folder = file.path.includes("/") ? file.path.slice(0, file.path.lastIndexOf("/")) : "";
  const basename = basenameOf(file.path);

  const frontmatter = file.frontmatter ?? parseFrontmatterBlock(file.content);
  const fromFilename = filenameDate(basename, folder, interop);
  const noteDate = noteDateOf(frontmatter);
  const noteType = typeOf(frontmatter);
  const lends = grantsDeadline(rules, tagsOf(frontmatter), noteType);

  // The filename convention wins when both exist; they agree in every daily note anyway.
  const inherited = fromFilename ?? (lends ? noteDate : null);

  const project = projectOf(frontmatter);
  const area = areaOf(frontmatter) ?? topFolder(file.path);
  const people = peopleOf(frontmatter);
  const noteTitle = titleOf(frontmatter);
  const kind = kindOf(rules, noteType);

  const tasks: Task[] = [];
  for (let line = 0; line < lines.length; line++) {
    const raw = lines[line];
    if (raw === undefined) continue;
    const parsed = parseTaskLine(stripCarriageReturn(raw));
    if (!parsed) continue;

    const prefix = extractPersonPrefix(parsed.description, knownPeople);
    const description = prefix ? prefix.rest : parsed.description;
    const taskPeople = prefix ? Array.from(new Set([...people, prefix.name])) : people;

    tasks.push({
      ...parsed,
      description,
      location: { path: file.path, line },
      project,
      area,
      people: taskPeople,
      noteTitle,
      noteType,
      noteDate,
      filenameDate: fromFilename,
      effectiveDate: effectiveDate(parsed, inherited),
      kind,
      open: isOpenStatus(interop, parsed.status),
      priority: priorityOf(parsed),
      hasChildren: hasIndentedChild(lines, line, parsed.indent.length),
    });
  }
  return tasks;
}

/**
 * Whether the task owns nested content. Deleting a parent would orphan its children, so
 * the auto-cleaner refuses to touch these.
 */
export function hasIndentedChild(lines: string[], line: number, indent: number): boolean {
  for (let i = line + 1; i < lines.length; i++) {
    const next = lines[i];
    if (next === undefined) return false;
    if (next.trim() === "") continue;
    return next.length - next.trimStart().length > indent;
  }
  return false;
}

function basenameOf(path: string): string {
  const file = path.slice(path.lastIndexOf("/") + 1);
  return file.endsWith(".md") ? file.slice(0, -3) : file;
}

function stripCarriageReturn(line: string): string {
  return line.endsWith("\r") ? line.slice(0, -1) : line;
}
