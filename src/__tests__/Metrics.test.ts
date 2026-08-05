import {
  closingState,
  isCancelled,
  monthlyClosed,
  monthsBetween,
  openState,
  datableFromNote,
  workingDaysBetween,
} from "../query/Metrics";
import { effectiveDate } from "../index/Buckets";
import { parseTaskLine, priorityOf } from "../index/TaskParser";
import type { Task, TaskKind } from "../types/task";

const D = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y!, m! - 1, d!);
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
    kind: "commitment" as TaskKind,
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

describe("monthlyClosed", () => {
  const tasks = [
    task("- [x] juny ✅ 2026-06-10", { open: false }),
    task("- [x] juny ✅ 2026-06-11", { open: false }),
    task("- [-] juliol cancel·lada ❌ 2026-07-02", { open: false }),
    task("- [x] agost ✅ 2026-08-04", { open: false }),
    task("- [x] fora de la finestra ✅ 2025-12-01", { open: false }),
    task("- [ ] oberta"),
  ];

  it("returns one entry per month, ending with the month in progress", () => {
    const series = monthlyClosed(tasks, TODAY, 3);
    expect(series.map((m) => `${m.year}-${m.month}`)).toEqual(["2026-5", "2026-6", "2026-7"]);
    expect(series.at(-1)!.current).toBe(true);
    expect(series.at(0)!.current).toBe(false);
  });

  it("keeps empty months as zeros rather than sliding the axis", () => {
    const series = monthlyClosed([task("- [x] agost ✅ 2026-08-04", { open: false })], TODAY, 4);
    expect(series.map((m) => m.total)).toEqual([0, 0, 0, 1]);
  });

  it("splits done from cancelled inside the month", () => {
    const july = monthlyClosed(tasks, TODAY, 3)[1]!;
    expect(july).toMatchObject({ done: 0, cancelled: 1, total: 1 });
  });

  it("drops closings older than the window instead of piling them on the first bar", () => {
    const series = monthlyClosed(tasks, TODAY, 3);
    expect(series.reduce((sum, m) => sum + m.total, 0)).toBe(4);
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
