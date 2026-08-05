import * as fs from "fs";
import * as path from "path";
import { bucketOf } from "../index/Buckets";
import { bucketCounts, countByKind } from "../query/Query";
import { ScopeFilter, parseObsidianIgnoreFilters } from "../index/ScopeFilter";
import { tasksFromFile } from "../index/buildTasks";
import { TASKS_PLUGIN_DATA, parseTasksData } from "../tasks/TasksPluginSettings";
import { DEFAULT_SETTINGS } from "../settings/Config";
import { formatIsoDate } from "../index/dates";
import { removeField, setDateField } from "../index/TaskLineEditor";
import { parseTaskLine } from "../index/TaskParser";
import { isEmptyTask } from "../index/EmptyTasks";
import type { Bucket, Task } from "../types/task";

/**
 * Runs the real pipeline over the real vault. Asserts INVARIANTS, not a snapshot: the vault
 * is a live working set, so pinning exact counts would fail every time Oriol triages a task
 * (it did, the first day). The invariant that matters is that no task line is ever dropped
 * or mangled — which is what a frozen count was only indirectly protecting.
 *
 * Reference date is pinned so bucket maths stays deterministic.
 */
const VAULT =
  process.env.TASK_CONSOLE_VAULT ??
  path.join(process.env.HOME ?? "", "Library/Mobile Documents/iCloud~md~obsidian/Documents/Bershka");

const REFERENCE_DAY = new Date(2026, 7, 5);

/**
 * Deliberately looser than the parser: any whitespace as indent, optional space after the
 * bullet. If the parser finds fewer lines than this, it is silently losing tasks — the exact
 * bug class that hid a task indented with EM SPACE.
 */
const LOOSE_TASK_LINE = /^\s*(?:[-*+]|\d+[.)])\s*\[(.)\]/;

const available = fs.existsSync(VAULT);
const describeVault = available ? describe : describe.skip;

if (!available) {
  console.warn(`[TaskConsole] vault not found at ${VAULT}, skipping audit`);
}

describeVault("real vault audit", () => {
  let tasks: Task[];
  let byBucket: Record<Bucket, Task[]>;
  let looseCount: number;
  let scanned: string[];

  beforeAll(() => {
    const interop = parseTasksData(read(path.join(VAULT, TASKS_PLUGIN_DATA)) ?? "{}");
    const appJson = read(path.join(VAULT, ".obsidian/app.json")) ?? "{}";
    const scope = new ScopeFilter([...DEFAULT_SETTINGS.excludedFolders, ...parseObsidianIgnoreFilters(appJson)]);

    tasks = [];
    scanned = [];
    looseCount = 0;

    for (const relative of markdownFiles(VAULT)) {
      if (!scope.includes(relative)) continue;
      const content = read(path.join(VAULT, relative));
      if (content === null) continue;
      scanned.push(relative);
      for (const line of content.split("\n")) {
        if (LOOSE_TASK_LINE.test(line.replace(/\r$/, ""))) looseCount++;
      }
      tasks.push(...tasksFromFile({ path: relative, content }, interop));
    }

    byBucket = { overdue: [], today: [], week: [], later: [], undated: [], closed: [] };
    for (const task of tasks) byBucket[bucketOf(task, REFERENCE_DAY)].push(task);

    const open = tasks.filter((t) => t.open).length;
    const kinds = countByKind(tasks);
    const people = new Set(tasks.filter((t) => t.open).flatMap((t) => t.people));
    console.log(
      `[audit] ${scanned.length} notes · ${tasks.length} task lines · ${open} open · ` +
        `overdue ${byBucket.overdue.length} today ${byBucket.today.length} week ${byBucket.week.length} ` +
        `later ${byBucket.later.length} undated ${byBucket.undated.length} · ` +
        `empty ${tasks.filter(isEmptyTask).length} · ` +
        `reference ${kinds.reference} someday ${kinds.someday} · ` +
        `people ${[...people].sort().join(", ")}`
    );
    // What the views actually show, which is not the same thing: reference lines are excluded.
    const shown = bucketCounts(tasks, REFERENCE_DAY);
    console.log(
      `[audit] shown to the user: overdue ${shown.overdue} today ${shown.today} week ${shown.week} ` +
        `later ${shown.later} undated ${shown.undated}`
    );
  });

  it("reads the Tasks plugin's own configuration from the vault", () => {
    const interop = parseTasksData(read(path.join(VAULT, TASKS_PLUGIN_DATA)) ?? "{}");
    expect(interop.useFilenameAsScheduledDate).toBe(true);
    expect(interop.filenameAsScheduledDateFormat).toBe("\\D\\i\\a\\r\\i YYYY-MM-DD");
    expect(interop.statuses.get("/")?.type).toBe("IN_PROGRESS");
    expect(interop.setDoneDate).toBe(true);
  });

  it("has a vault worth auditing", () => {
    expect(scanned.length).toBeGreaterThan(500);
    expect(tasks.length).toBeGreaterThan(100);
    expect(tasks.filter((t) => t.open).length).toBeGreaterThan(0);
  });

  it("does not drop a single task line a looser pattern can see", () => {
    expect(tasks.length).toBe(looseCount);
  });

  it("distributes every open task into exactly one bucket", () => {
    const open = tasks.filter((t) => t.open).length;
    const bucketed =
      byBucket.overdue.length +
      byBucket.today.length +
      byBucket.week.length +
      byBucket.later.length +
      byBucket.undated.length;
    expect(bucketed).toBe(open);
    expect(byBucket.closed.length).toBe(tasks.length - open);
  });

  it("resolves an effective date for every task that is not undated", () => {
    for (const bucket of ["overdue", "today", "week", "later"] as const) {
      for (const task of byBucket[bucket]) expect(task.effectiveDate).not.toBeNull();
    }
    for (const task of byBucket.undated) expect(task.effectiveDate).toBeNull();
  });

  it("reads the note's own `data:` for the weekly notes the filename format misses", () => {
    const weekly = tasks.filter((t) => /Diari setmana/.test(t.location.path) && t.open);
    expect(weekly.length).toBeGreaterThan(0);
    for (const task of weekly) {
      // No date in the filename, so this used to fall through to "undated".
      expect(task.filenameDate).toBeNull();
      expect(task.noteDate).not.toBeNull();
      expect(task.effectiveDate).not.toBeNull();
    }
  });

  it("does not turn a meeting's date into a deadline", () => {
    const meetings = tasks.filter((t) => t.noteType === "reunió" && t.open);
    expect(meetings.length).toBeGreaterThan(0);
    for (const task of meetings) {
      expect(task.noteDate).not.toBeNull();
      // Its own 📅 may exist; what must not happen is inheriting one from the meeting date.
      if (!task.fields.due?.date && !task.fields.scheduled?.date && !task.fields.start?.date) {
        expect(task.effectiveDate).toBeNull();
      }
    }
  });

  it("classifies documentation checklists as reference, and keeps them out of the counts", () => {
    const reference = tasks.filter((t) => t.kind === "reference");
    expect(reference.length).toBeGreaterThan(0);
    for (const task of reference) expect(task.noteType).toBe("documentacio");

    const counted = bucketCounts(tasks, REFERENCE_DAY);
    const total = Object.values(counted).reduce((sum, n) => sum + n, 0);
    expect(total).toBe(tasks.filter((t) => t.kind === "commitment").length);
  });

  it("resolves people from the frontmatter, so the who-with lens has something to group by", () => {
    const withPeople = tasks.filter((t) => t.open && t.people.length > 0);
    expect(withPeople.length).toBeGreaterThan(0);
    for (const task of withPeople) {
      for (const person of task.people) {
        expect(person).not.toMatch(/[[\]]/); // wikilinks unwrapped
        expect(person.trim()).toBe(person);
      }
    }
  });

  it("only inherits a filename date in notes actually named that way", () => {
    const inherited = tasks.filter(
      (t) => t.filenameDate !== null && !t.fields.due?.date && !t.fields.scheduled?.date && !t.fields.start?.date
    );
    for (const task of inherited) {
      expect(path.basename(task.location.path)).toMatch(/^Diari \d{4}-\d{2}-\d{2}\.md$/);
      expect(formatIsoDate(task.effectiveDate!)).toBe(formatIsoDate(task.filenameDate!));
    }
  });

  it("excludes template and documentation folders", () => {
    const paths = tasks.map((t) => t.location.path);
    for (const excluded of ["99 xTemplates", "97 xScripts", "96 IA Docs", "07 Arxiu"]) {
      expect(paths.some((p) => p.startsWith(`${excluded}/`))).toBe(false);
    }
  });

  it("never flags a task with content as empty", () => {
    for (const task of tasks.filter(isEmptyTask)) {
      expect(task.description).toBe("");
      expect(task.tags).toEqual([]);
      expect(task.links).toEqual([]);
      expect(task.hasChildren).toBe(false);
      expect(Object.keys(task.fields).filter((k) => k !== "created")).toEqual([]);
    }
  });

  it("can reschedule every real open task without collateral damage", () => {
    for (const task of tasks.filter((t) => t.open)) {
      const next = setDateField(task, "due", REFERENCE_DAY);
      const reparsed = parseTaskLine(next);

      expect(reparsed).not.toBeNull();
      expect(formatIsoDate(reparsed!.fields.due!.date!)).toBe("2026-08-05");
      expect(reparsed!.status).toBe(task.status);
      expect(reparsed!.indent).toBe(task.indent);
      expect(reparsed!.description).toBe(task.description);
      for (const [key, field] of Object.entries(task.fields)) {
        if (key === "due") continue;
        expect(reparsed!.fields[key as keyof typeof reparsed.fields]?.value).toBe(field!.value);
      }
      expect(removeField(reparsed!, "due")).toBe(
        task.fields.due ? removeField(task, "due").trimEnd() : task.raw.trimEnd()
      );
    }
  });

  it("never loses text: every parsed line rebuilds to itself", () => {
    for (const task of tasks) {
      const rebuilt =
        task.raw.slice(0, task.bodySpan.end) +
        Object.values(task.fields)
          .filter((f) => f !== undefined)
          .sort((a, b) => a!.span.start - b!.span.start)
          .map((f) => task.raw.slice(f!.span.start, f!.span.end))
          .join("");
      expect(rebuilt).toBe(task.raw);
    }
  });
});

function read(file: string): string | null {
  try {
    return fs.readFileSync(file, "utf8");
  } catch {
    return null;
  }
}

const SKIP_DIRS = new Set([".obsidian", ".trash", ".git", "node_modules"]);

function* markdownFiles(root: string, relative = ""): Generator<string> {
  const dir = relative ? path.join(root, relative) : root;
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const child = relative ? `${relative}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      yield* markdownFiles(root, child);
    } else if (entry.name.endsWith(".md")) {
      yield child;
    }
  }
}
