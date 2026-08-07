import {
  closingState,
  isCancelled,
  monthlyFlow,
  weekAhead,
  monthsBetween,
  openState,
  datableFromNote,
  workingDaysBetween,
  todayProgress,
} from "../query/Metrics";
import { effectiveDate } from "../index/Buckets";
import { parseTaskLine, priorityOf } from "../index/TaskParser";
import type { Task, TaskKind } from "../types/task";

const D = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y!, m! - 1, d);
};
const TODAY = D("2026-08-05"); // a Wednesday

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

describe("openState", () => {
  const tasks = [
    task("- [ ] endarrerida 📅 2026-06-29", { location: { path: "01 Diari/a.md", line: 1 } }),
    task("- [ ] també endarrerida 📅 2026-08-04", { location: { path: "01 Diari/a.md", line: 2 } }),
    task("- [ ] aquesta setmana 📅 2026-08-07", { location: { path: "01 Diari/b.md", line: 1 } }),
    task("- [ ] sense data", { location: { path: "01 Diari/b.md", line: 2 } }),
    task("- [ ] sense data però la nota en té", {
      location: { path: "02 Reunions/c.md", line: 1 },
      noteDate: D("2026-07-27"),
    }),
    task("- [x] feta ✅ 2026-08-03", { open: false }),
  ];

  it("counts the open tasks and the notes they live in", () => {
    const state = openState(tasks, TODAY);
    expect(state.open).toBe(5);
    expect(state.notes).toBe(3);
  });

  it("measures the oldest overdue task in days past its date", () => {
    const state = openState(tasks, TODAY);
    expect(state.renegotiate).toBe(2);
    expect(state.oldestOverdueDays).toBe(37);
  });

  it("separates the undated tasks whose note carries a date the plugin could copy", () => {
    const state = openState(tasks, TODAY);
    expect(state.undated).toBe(2);
    expect(state.datableFromNote).toBe(1);
    expect(datableFromNote(tasks, TODAY).map((t) => t.description)).toEqual([
      "sense data però la nota en té",
    ]);
  });

  it("leaves documentation and someday lines out, exactly like the counters do", () => {
    const mixed = [
      task("- [ ] compromís"),
      task("- [ ] checklist de documentació", { kind: "reference" }),
      task("- [ ] algun dia", { kind: "someday" }),
    ];
    expect(openState(mixed, TODAY).open).toBe(1);
  });
});

describe("closingState", () => {
  const closed = [
    task("- [x] una ✅ 2026-06-10", { open: false }),
    task("- [x] dues ✅ 2026-07-01", { open: false }),
    task("- [x] tres ✅ 2026-08-04", { open: false }),
    task("- [ ] oberta"),
  ];

  it("splits ✅ from ❌ and finds the first closing date", () => {
    const state = closingState(closed, TODAY);
    expect(state.closed).toBe(3);
    expect(state.done).toBe(3);
    expect(state.cancelled).toBe(0);
    expect(state.first).toEqual(D("2026-06-10"));
    expect(state.last).toEqual(D("2026-08-04"));
    expect(state.lastCancelled).toBeNull();
  });

  it("counts a cancelled line as a closing, because saying no is a decision", () => {
    const state = closingState([...closed, task("- [-] no la faré ❌ 2026-08-05", { open: false })], TODAY);
    expect(state.cancelled).toBe(1);
    expect(state.lastCancelled).toEqual(D("2026-08-05"));
  });

  it("divides by working days, not by days", () => {
    // 2026-08-03 (Monday) to 2026-08-05 (Wednesday) is three working days, two closings.
    const state = closingState(
      [task("- [x] a ✅ 2026-08-03", { open: false }), task("- [x] b ✅ 2026-08-05", { open: false })],
      TODAY
    );
    expect(state.perWorkingDay).toBeCloseTo(2 / 3, 5);
  });

  it("has no average to report when nothing carries a closing date", () => {
    expect(closingState([task("- [x] sense data", { open: false })], TODAY).perWorkingDay).toBeNull();
  });

  it("ignores a closing date in the future, which is a typo and not throughput", () => {
    const state = closingState([task("- [x] demà ✅ 2026-09-01", { open: false })], TODAY);
    expect(state.done).toBe(1);
    expect(state.first).toBeNull();
    expect(state.perWorkingDay).toBeNull();
  });
});

describe("isCancelled", () => {
  it("recognises the status and the ❌ date independently", () => {
    expect(isCancelled(task("- [-] cancel·lada", { open: false }))).toBe(true);
    expect(isCancelled(task("- [x] amb creu ❌ 2026-08-01", { open: false }))).toBe(true);
    expect(isCancelled(task("- [x] feta ✅ 2026-08-01", { open: false }))).toBe(false);
  });
});

describe("monthlyFlow", () => {
  const tasks = [
    task("- [x] juny ✅ 2026-06-10", { open: false }),
    task("- [x] juny ✅ 2026-06-11", { open: false }),
    task("- [-] juliol cancel·lada ❌ 2026-07-02", { open: false }),
    task("- [x] agost ✅ 2026-08-04", { open: false }),
    task("- [x] fora de la finestra ✅ 2025-12-01", { open: false }),
    task("- [ ] oberta"),
  ];

  it("returns one entry per month, ending with the month in progress", () => {
    const series = monthlyFlow(tasks, TODAY, 3);
    expect(series.map((m) => `${m.year}-${m.month}`)).toEqual(["2026-5", "2026-6", "2026-7"]);
    expect(series.at(-1)!.current).toBe(true);
    expect(series.at(0)!.current).toBe(false);
  });

  it("keeps empty months as zeros rather than sliding the axis", () => {
    const series = monthlyFlow([task("- [x] agost ✅ 2026-08-04", { open: false })], TODAY, 4);
    expect(series.map((m) => m.closed)).toEqual([0, 0, 0, 1]);
  });

  it("splits done from cancelled inside the month", () => {
    const july = monthlyFlow(tasks, TODAY, 3)[1]!;
    expect(july).toMatchObject({ done: 0, cancelled: 1, closed: 1 });
  });

  it("drops closings older than the window instead of piling them on the first bar", () => {
    const series = monthlyFlow(tasks, TODAY, 3);
    expect(series.reduce((sum, m) => sum + m.closed, 0)).toBe(4);
  });

  /* ── the inflow, which is counted by a different date than the outflow ── */

  it("counts a task into the month it was created, whatever it is doing now", () => {
    const born = [
      task("- [ ] amb ➕ ➕ 2026-06-20"),
      task("- [x] creada al juny, tancada a l'agost ➕ 2026-06-21 ✅ 2026-08-03", { open: false }),
    ];
    const series = monthlyFlow(born, TODAY, 3);
    expect(series.map((m) => m.created)).toEqual([2, 0, 0]);
    expect(series.map((m) => m.closed)).toEqual([0, 0, 1]);
  });

  it("falls back to the note's date when the line carries no ➕", () => {
    const series = monthlyFlow(
      [
        task("- [ ] del diari", { filenameDate: D("2026-07-10") }),
        task("- [ ] de la reunió", { noteDate: D("2026-07-11") }),
        task("- [ ] enlloc"),
      ],
      TODAY,
      3
    );
    expect(series.map((m) => m.created)).toEqual([0, 2, 0]);
  });

  /** The cohort reading: of what came in that month, what never got resolved. */
  it("says how many of a month's tasks are still open", () => {
    const series = monthlyFlow(
      [
        task("- [ ] segueix oberta", { filenameDate: D("2026-06-02") }),
        task("- [x] tancada ✅ 2026-06-30", { open: false, filenameDate: D("2026-06-03") }),
      ],
      TODAY,
      3
    );
    expect(series[0]).toMatchObject({ created: 2, stillOpen: 1, closed: 1 });
  });
});

describe("weekAhead", () => {
  const tasks = [
    task("- [ ] endarrerida 📅 2026-07-30"),
    task("- [ ] avui 📅 2026-08-05"),
    task("- [ ] avui també 📅 2026-08-05"),
    task("- [ ] demà 📅 2026-08-06"),
    task("- [ ] dissabte 📅 2026-08-08"),
    task("- [ ] fora de la finestra 📅 2026-08-20"),
    task("- [ ] sense data"),
    task("- [x] feta avui 📅 2026-08-05 ✅ 2026-08-05", { open: false }),
  ];

  it("gives one column per day starting today, not per calendar week", () => {
    const week = weekAhead(tasks, TODAY, { span: 7 });
    expect(week.days.map((day) => day.iso)).toEqual([
      "2026-08-05",
      "2026-08-06",
      "2026-08-07",
      "2026-08-08",
      "2026-08-09",
      "2026-08-10",
      "2026-08-11",
    ]);
    expect(week.days[0]!.today).toBe(true);
    expect(week.days.filter((day) => day.weekend).map((day) => day.iso)).toEqual(["2026-08-08", "2026-08-09"]);
  });

  it("counts only open tasks, on the day their effective date falls", () => {
    const week = weekAhead(tasks, TODAY, { span: 7 });
    expect(week.days.map((day) => day.count)).toEqual([2, 1, 0, 1, 0, 0, 0]);
    expect(week.planned).toBe(4);
    expect(week.peak).toBe(2);
  });

  it("says what the seven days leave out instead of hiding it", () => {
    const week = weekAhead(tasks, TODAY, { span: 7 });
    expect(week.overdue).toBe(1);
    expect(week.later).toBe(1);
    expect(week.undated).toBe(1);
  });

  it("keeps documentation and someday lines out, like every other count", () => {
    const week = weekAhead(
      [task("- [ ] checklist 📅 2026-08-06", { kind: "reference" }), task("- [ ] idea", { kind: "someday" })],
      TODAY,
      { span: 7 }
    );
    expect(week.planned).toBe(0);
    expect(week.undated).toBe(0);
  });

  /* ── with the weekend hidden ── */

  it("runs over working days and skips Saturday and Sunday", () => {
    const week = weekAhead(tasks, TODAY, { span: 7, weekends: false });
    expect(week.days.map((day) => day.iso)).toEqual([
      "2026-08-05",
      "2026-08-06",
      "2026-08-07",
      "2026-08-10",
      "2026-08-11",
      "2026-08-12",
      "2026-08-13",
    ]);
  });

  /** The whole point of the setting: a hidden day cannot take its tasks with it. */
  it("folds a weekend task into the Monday that follows it, and says which days that is", () => {
    const week = weekAhead(tasks, TODAY, { span: 7, weekends: false });
    const monday = week.days[3]!;
    expect(monday.days).toEqual(["2026-08-08", "2026-08-09", "2026-08-10"]);
    expect(monday.count).toBe(1);
    expect(monday.absorbed).toBe(1);
    // Nothing is lost and nothing is counted twice, whichever way the strip is drawn.
    expect(week.planned).toBe(4);
    expect(week.overdue + week.planned + week.later + week.undated).toBe(
      weekAhead(tasks, TODAY, { span: 7 }).overdue + 4 + 1 + 1
    );
  });

  it("keeps today's column even when today is a Saturday", () => {
    const saturday = D("2026-08-08");
    const week = weekAhead([task("- [ ] avui, dissabte 📅 2026-08-08")], saturday, { span: 3, weekends: false });
    expect(week.days.map((day) => day.iso)).toEqual(["2026-08-08", "2026-08-10", "2026-08-11"]);
    expect(week.days[0]).toMatchObject({ today: true, weekend: true, count: 1, absorbed: 0 });
    // Sunday had no column of its own, so the Monday carries it.
    expect(week.days[1]!.days).toEqual(["2026-08-09", "2026-08-10"]);
  });
});

describe("todayProgress", () => {
  it("counts tasks pending today and tasks closed today, separately", () => {
    const tasks = [
      task("- [ ] avui 📅 2026-08-05"),
      task("- [ ] també avui 📅 2026-08-05"),
      task("- [ ] demà 📅 2026-08-06"),
      task("- [x] tancada avui ✅ 2026-08-05", { open: false }),
      task("- [-] cancel·lada avui ❌ 2026-08-05", { open: false }),
      task("- [x] tancada ahir ✅ 2026-08-04", { open: false }),
    ];
    const progress = todayProgress(tasks, TODAY);
    expect(progress.pending).toBe(2);
    expect(progress.closed).toBe(2);
  });

  it("counts a task closed today even when it was due a different day", () => {
    const tasks = [task("- [x] endarrerida però tancada avui 📅 2026-07-20 ✅ 2026-08-05", { open: false })];
    expect(todayProgress(tasks, TODAY).closed).toBe(1);
  });

  it("leaves documentation and someday lines out, exactly like the other counters", () => {
    const tasks = [
      task("- [ ] checklist 📅 2026-08-05", { kind: "reference" }),
      task("- [x] idea tancada ✅ 2026-08-05", { open: false, kind: "someday" }),
    ];
    const progress = todayProgress(tasks, TODAY);
    expect(progress.pending).toBe(0);
    expect(progress.closed).toBe(0);
  });
});

describe("workingDaysBetween", () => {
  it("counts both ends and skips the weekend", () => {
    expect(workingDaysBetween(D("2026-08-03"), D("2026-08-07"))).toBe(5);
    expect(workingDaysBetween(D("2026-08-03"), D("2026-08-10"))).toBe(6);
    expect(workingDaysBetween(D("2026-08-08"), D("2026-08-09"))).toBe(0);
  });

  it("is zero when the range runs backwards", () => {
    expect(workingDaysBetween(D("2026-08-10"), D("2026-08-03"))).toBe(0);
  });
});

describe("monthsBetween", () => {
  it("counts whole months only", () => {
    expect(monthsBetween(D("2025-12-08"), D("2026-08-05"))).toBe(7);
    expect(monthsBetween(D("2025-12-01"), D("2026-08-05"))).toBe(8);
    expect(monthsBetween(D("2026-08-05"), D("2026-08-05"))).toBe(0);
  });
});
