import * as fs from "fs";
import * as path from "path";
import { bucketOf } from "../index/Buckets";
import { bucketCounts, countByKind } from "../query/Query";
import { closingState, monthlyFlow, openState, weekAhead } from "../query/Metrics";
import { healthFindings } from "../query/Health";
import { focusSections } from "../query/Focus";
import { ScopeFilter, parseObsidianIgnoreFilters } from "../index/ScopeFilter";
import { tasksFromFile } from "../index/buildTasks";
import { TASKS_PLUGIN_DATA, parseTasksData } from "../tasks/TasksPluginSettings";
import { DEFAULT_SETTINGS } from "../settings/Config";
import { formatIsoDate } from "../index/dates";
import { removeField, setDateField } from "../index/TaskLineEditor";
import { parseTaskLine } from "../index/TaskParser";
import { isEmptyTask } from "../index/EmptyTasks";
import type { Bucket, FieldKey, Task } from "../types/task";

/**
 * Runs the real pipeline over the real vault. Asserts INVARIANTS, not a snapshot: the vault
 * is a live working set, so pinning exact counts would fail every time Oriol triages a task
 * (it did, the first day). The invariant that matters is that no task line is ever dropped
 * or mangled — which is what a frozen count was only indirectly protecting.
 *
 * Reference date is pinned so bucket maths stays deterministic.
 */
const VAULT =
  process.env.TASK_SMITH_VAULT ??
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
  console.warn(`[TaskSmith] vault not found at ${VAULT}, skipping audit`);
}

describeVault("real vault audit", () => {
  let tasks: Task[];
  let byBucket: Record<Bucket, Task[]>;
  let looseCount: number;
  let scanned: string[];

  beforeAll(() => {
    const interop = parseTasksData(read(path.join(VAULT, ".obsidian", TASKS_PLUGIN_DATA)) ?? "{}");
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
    const interop = parseTasksData(read(path.join(VAULT, ".obsidian", TASKS_PLUGIN_DATA)) ?? "{}");
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

  /**
   * Invariant, not a count: `expect(weekly.length).toBeGreaterThan(0)` passed the day it was
   * written and failed as soon as Oriol emptied the weekly notes for real. The rule that matters
   * is that *if* such a task exists, it resolves a date from the frontmatter — vacuously true
   * when there are none. This is the same trap the pinned bucket counts fell into.
   */
  it("reads the note's own `data:` for the weekly notes the filename format misses", () => {
    const weekly = tasks.filter((t) => /Diari setmana/.test(t.location.path) && t.open);
    for (const task of weekly) {
      expect(task.filenameDate).toBeNull();
      expect(task.noteDate).not.toBeNull();
      expect(task.effectiveDate).not.toBeNull();
    }
    // A synthetic case keeps the rule covered even when the vault has no weekly task left.
    const [synthetic] = tasksFromFile(
      {
        path: "01 Diari/2026/07/Diari setmana 29 de 2026.md",
        content: "---\ndata: 2026-07-13\ntags: [Nota_Setmanal]\n---\n\n- [ ] tasca de setmana\n",
      },
      parseTasksData(read(path.join(VAULT, ".obsidian", TASKS_PLUGIN_DATA)) ?? "{}")
    );
    expect(synthetic!.filenameDate).toBeNull();
    expect(formatIsoDate(synthetic!.effectiveDate!)).toBe("2026-07-13");
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

  it("puts every open commitment in exactly one section of the focus view", () => {
    const sections = focusSections({ tasks, chosen: [], today: REFERENCE_DAY });
    const shown = [
      ...sections.urgent,
      ...sections.chosen,
      ...sections.renegotiate,
      ...sections.undated,
      ...sections.later,
    ];
    const commitments = tasks.filter((t) => t.open && t.kind === "commitment" && !isEmptyTask(t));

    expect(shown).toHaveLength(commitments.length);
    expect(new Set(shown.map((t) => `${t.location.path}:${t.location.line}`)).size).toBe(shown.length);
    console.log(
      `[audit] focus view: ${sections.urgent.length} urgent · ${sections.renegotiate.length} to renegotiate · ` +
        `${sections.undated.length} undated · ${sections.later.length} later`
    );
  });

  /**
   * The control centre's strip, measured rather than pinned. Every assertion is a relation
   * between numbers — the counts themselves move every time Oriol triages something, and pinning
   * them is the trap this file exists to avoid.
   */
  it("agrees with the bucket counters about what is open", () => {
    const open = openState(tasks, REFERENCE_DAY);
    const shown = bucketCounts(tasks, REFERENCE_DAY);

    expect(open.open).toBe(shown.overdue + shown.today + shown.week + shown.later + shown.undated);
    expect(open.renegotiate).toBe(shown.overdue);
    expect(open.undated).toBe(shown.undated);
    // A task lives in exactly one note, so notes can never outnumber tasks.
    expect(open.notes).toBeGreaterThan(0);
    expect(open.notes).toBeLessThanOrEqual(open.open);
    expect(open.datableFromNote).toBeLessThanOrEqual(open.undated);
    if (open.oldestOverdueDays !== null) expect(open.oldestOverdueDays).toBeGreaterThan(0);

    const closings = closingState(tasks, REFERENCE_DAY);
    expect(closings.done + closings.cancelled).toBe(closings.closed);

    const months = monthlyFlow(tasks, REFERENCE_DAY);
    const inWindow = months.reduce((sum, month) => sum + month.closed, 0);
    expect(inWindow).toBeLessThanOrEqual(closings.closed);
    expect(months.at(-1)?.current).toBe(true);
    for (const month of months) {
      expect(month.done + month.cancelled).toBe(month.closed);
      // The cohort is a subset of the month's intake, whatever the two dates are.
      expect(month.stillOpen).toBeLessThanOrEqual(month.created);
    }

    console.log(
      `[audit] centre de control: ${open.open} obertes en ${open.notes} notes · ` +
        `${open.renegotiate} per renegociar (la més antiga fa ${open.oldestOverdueDays} dies) · ` +
        `${open.undated} sense data (${open.datableFromNote} amb data a la nota) · ` +
        `${closings.perWorkingDay === null ? "—" : closings.perWorkingDay.toFixed(1)} tancades/dia laborable ` +
        `(${closings.done} amb ✅, ${closings.cancelled} amb ❌)`
    );
    console.log(
      `[audit] creades/tancades per mes: ${months
        .map(
          (month) =>
            `${month.year}-${String(month.month + 1).padStart(2, "0")} ${month.created}/${month.closed}`
        )
        .join(" · ")}`
    );

    /*
     * The week strip. Its five numbers partition the open commitments exactly once, which is the
     * invariant worth having: a day column that quietly dropped a task, or counted it twice,
     * would be invisible in the UI and is the only way this strip can lie.
     */
    const week = weekAhead(tasks, REFERENCE_DAY, { span: 7 });
    expect(week.days).toHaveLength(7);
    expect(week.planned + week.overdue + week.later + week.undated).toBe(open.open);
    expect(week.overdue).toBe(open.renegotiate);
    expect(week.undated).toBe(open.undated);
    expect(week.peak).toBeLessThanOrEqual(week.planned || 0);

    /*
     * And the same invariant with the weekend hidden, which is the setting's whole risk: a
     * Saturday without a column must have handed its tasks to a Monday, not dropped them. The
     * two strips cover different windows, so `later` moves — the partition does not.
     */
    const working = weekAhead(tasks, REFERENCE_DAY, { span: 7, weekends: false });
    expect(working.days).toHaveLength(7);
    expect(working.days.some((day) => !day.today && day.weekend)).toBe(false);
    expect(working.planned + working.overdue + working.later + working.undated).toBe(open.open);
    for (const day of working.days) {
      expect(day.days[day.days.length - 1]).toBe(day.iso);
      expect(day.absorbed).toBeLessThanOrEqual(day.count);
    }

    console.log(
      `[audit] la setmana: ${week.days
        .map((day) => `${day.iso.slice(5)} ${day.count}`)
        .join(" · ")} · abans d'avui ${week.overdue} · més enllà ${week.later} · sense data ${week.undated}`
    );
    console.log(
      `[audit] la setmana, sense caps de setmana: ${working.days
        .map((day) => `${day.iso.slice(5)} ${day.count}${day.absorbed > 0 ? `(+${day.absorbed})` : ""}`)
        .join(" · ")} · més enllà ${working.later}`
    );
  });

  it("finds something concrete to fix, and every finding can act on something real", () => {
    const findings = healthFindings(tasks, {
      today: REFERENCE_DAY,
      staleThresholdDays: DEFAULT_SETTINGS.staleThresholdDays,
      notes: scanned.length,
      lines: tasks.length,
    });
    expect(findings.length).toBeGreaterThan(0);

    for (const finding of findings) {
      expect(finding.title.trim()).not.toBe("");
      expect(finding.detail.trim()).not.toBe("");
      // An action with nowhere to go is a dead link dressed as help.
      if (finding.action) expect(finding.filter !== undefined || finding.fix !== undefined).toBe(true);
      if (finding.fix) expect(finding.tasks?.length ?? 0).toBeGreaterThan(0);
    }

    // The only finding that writes must never touch a task that already has a date of its own.
    const dating = findings.find((finding) => finding.fix === "apply-note-date");
    for (const task of dating?.tasks ?? []) {
      expect(task.open).toBe(true);
      expect(task.effectiveDate).toBeNull();
      expect(task.noteDate).not.toBeNull();
    }

    console.log(`[audit] salut: ${findings.map((finding) => finding.title).join(" · ")}`);
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
        expect(reparsed!.fields[key as FieldKey]?.value).toBe(field.value);
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
          .sort((a, b) => a.span.start - b.span.start)
          .map((f) => task.raw.slice(f.span.start, f.span.end))
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
