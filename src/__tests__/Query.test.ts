import { DEFAULT_QUERY, NO_PROJECT, bucketCounts, filterTasks, groupTasks, runQuery, sortTasks, type QueryContext } from "../query/Query";
import { effectiveDate } from "../index/Buckets";
import { parseTaskLine, priorityOf } from "../index/TaskParser";
import type { Task } from "../types/task";
import { dayWithAge, relativeLabel } from "../views/format";

const D = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y!, m! - 1, d);
};
const TODAY = D("2026-08-05");

const ctx: QueryContext = { today: TODAY, mtimeOf: () => null, staleThresholdDays: 14 };

let line = 0;
function task(raw: string, extra: Partial<Task> = {}): Task {
  const parsed = parseTaskLine(raw);
  if (!parsed) throw new Error(raw);
  const filenameDate = extra.filenameDate ?? null;
  return {
    ...parsed,
    location: { path: extra.location?.path ?? "01 Diari/nota.md", line: line++ },
    project: null,
    area: null,
    people: [],
    noteTitle: null,
    noteType: null,
    noteDate: null,
    filenameDate,
    effectiveDate: effectiveDate(parsed, filenameDate),
    kind: "commitment",
    open: extra.open ?? parsed.status === " ",
    priority: priorityOf(parsed),
    hasChildren: false,
    ...extra,
  };
}

describe("filterTasks", () => {
  const tasks = [
    task("- [ ] endarrerida 📅 2026-07-01"),
    task("- [ ] avui 📅 2026-08-05"),
    task("- [ ] sense data"),
    task("- [x] feta 📅 2026-07-01 ✅ 2026-07-02", { open: false }),
  ];

  it("shows only open tasks by default", () => {
    expect(filterTasks(tasks, DEFAULT_QUERY, ctx)).toHaveLength(3);
  });

  it("can scope to closed or all", () => {
    expect(filterTasks(tasks, { ...DEFAULT_QUERY, statusScope: "closed" }, ctx)).toHaveLength(1);
    expect(filterTasks(tasks, { ...DEFAULT_QUERY, statusScope: "all" }, ctx)).toHaveLength(4);
  });

  it("filters by bucket", () => {
    expect(filterTasks(tasks, { ...DEFAULT_QUERY, buckets: ["overdue"] }, ctx)).toHaveLength(1);
    expect(filterTasks(tasks, { ...DEFAULT_QUERY, buckets: ["undated"] }, ctx)).toHaveLength(1);
  });

  /** What clicking a column of the week strip does. */
  it("filters by a single day, and leaves the undated out of every day", () => {
    expect(filterTasks(tasks, { ...DEFAULT_QUERY, dueOn: ["2026-08-05"] }, ctx)).toHaveLength(1);
    expect(filterTasks(tasks, { ...DEFAULT_QUERY, dueOn: ["2026-07-01"] }, ctx)).toHaveLength(1);
    expect(filterTasks(tasks, { ...DEFAULT_QUERY, dueOn: ["2026-08-06"] }, ctx)).toHaveLength(0);
  });

  it("counts a date the note lends as that task's day", () => {
    const inherited = [task("- [ ] de la nota", { filenameDate: D("2026-08-07") })];
    expect(filterTasks(inherited, { ...DEFAULT_QUERY, dueOn: ["2026-08-07"] }, ctx)).toHaveLength(1);
  });

  it("matches text against description and path", () => {
    expect(filterTasks(tasks, { ...DEFAULT_QUERY, text: "SENSE" }, ctx)).toHaveLength(1);
    expect(filterTasks(tasks, { ...DEFAULT_QUERY, text: "01 Diari" }, ctx)).toHaveLength(3);
    expect(filterTasks(tasks, { ...DEFAULT_QUERY, text: "no hi és" }, ctx)).toHaveLength(0);
  });

  it("filters by project, treating absent as 'no project'", () => {
    const withProject = [task("- [ ] a", { project: "Zenit" }), task("- [ ] b")];
    expect(filterTasks(withProject, { ...DEFAULT_QUERY, project: "Zenit" }, ctx)).toHaveLength(1);
    expect(filterTasks(withProject, { ...DEFAULT_QUERY, project: NO_PROJECT }, ctx)).toHaveLength(1);
  });

  it("filters stale tasks by threshold", () => {
    const stale = [task("- [ ] vella ➕ 2026-07-01"), task("- [ ] nova ➕ 2026-08-04")];
    expect(filterTasks(stale, { ...DEFAULT_QUERY, staleOnly: true }, ctx)).toHaveLength(1);
  });
});

describe("sortTasks", () => {
  it("puts undated tasks last when sorting by date", () => {
    const sorted = sortTasks(
      [task("- [ ] sense data"), task("- [ ] aviat 📅 2026-08-06"), task("- [ ] tard 📅 2026-09-01")],
      "date",
      ctx
    );
    expect(sorted.map((t) => t.description)).toEqual(["aviat", "tard", "sense data"]);
  });

  it("sorts by priority with unprioritised last", () => {
    const sorted = sortTasks(
      [task("- [ ] cap"), task("- [ ] baixa 🔽"), task("- [ ] maxima 🔺")],
      "priority",
      ctx
    );
    expect(sorted.map((t) => t.description)).toEqual(["maxima", "baixa", "cap"]);
  });

  it("sorts by age, oldest first", () => {
    const sorted = sortTasks([task("- [ ] nova ➕ 2026-08-01"), task("- [ ] vella ➕ 2026-01-01")], "age", ctx);
    expect(sorted.map((t) => t.description)).toEqual(["vella", "nova"]);
  });
});

describe("groupTasks", () => {
  it("orders bucket groups from most urgent", () => {
    const groups = groupTasks(
      [task("- [ ] sense data"), task("- [ ] avui 📅 2026-08-05"), task("- [ ] vella 📅 2026-01-01")],
      "bucket",
      ctx
    );
    expect(groups.map((g) => g.key)).toEqual(["overdue", "today", "undated"]);
    expect(groups[0]!.label).toBe("Endarrerides");
  });

  it("groups by project with a bucket for the unassigned", () => {
    const groups = groupTasks([task("- [ ] a", { project: "Zenit" }), task("- [ ] b")], "project", ctx);
    expect(groups.map((g) => g.label).sort()).toEqual([NO_PROJECT, "Zenit"].sort());
  });
});

describe("runQuery and counts", () => {
  it("filters, sorts and groups in one pass", () => {
    const groups = runQuery(
      [task("- [ ] vella 📅 2026-01-01"), task("- [x] feta", { open: false }), task("- [ ] sense data")],
      DEFAULT_QUERY,
      ctx
    );
    expect(groups.map((g) => g.key)).toEqual(["overdue", "undated"]);
  });

  it("counts every bucket", () => {
    const counts = bucketCounts([task("- [ ] a 📅 2026-01-01"), task("- [ ] b"), task("- [x] c", { open: false })], TODAY);
    expect(counts.overdue).toBe(1);
    expect(counts.undated).toBe(1);
    expect(counts.closed).toBe(1);
  });
});

describe("relativeLabel", () => {
  it.each([
    ["2026-08-05", "avui"],
    ["2026-08-06", "demà"],
    ["2026-08-04", "ahir"],
    ["2026-08-07", "demà passat"],
    ["2026-08-01", "fa 4 dies"],
    ["2026-06-18", "fa 7 setmanes"],
    ["2026-02-05", "fa 6 mesos"],
    ["2025-08-05", "fa 1 any"],
    ["2026-08-12", "en 1 setmana"],
  ])("%s -> %s", (iso, expected) => {
    expect(relativeLabel(D(iso), TODAY)).toBe(expected);
  });

  it("labels a missing date", () => {
    expect(relativeLabel(null, TODAY)).toBe("sense data");
  });
});

describe("dayWithAge", () => {
  it("names the day and nothing else while the day is still ahead", () => {
    expect(dayWithAge(D("2026-08-05"), TODAY)).toBe("avui");
    expect(dayWithAge(D("2026-08-06"), TODAY)).toBe("demà");
    expect(dayWithAge(D("2026-09-15"), TODAY)).toBe("dt. 15 set");
  });

  it("says how long ago for a day already gone, which is the one you can accept by mistake", () => {
    expect(dayWithAge(D("2026-03-15"), TODAY)).toBe("dg. 15 març · fa 5 mesos");
    expect(dayWithAge(D("2026-08-04"), TODAY)).toBe("dt. 4 ag · ahir");
  });
});
