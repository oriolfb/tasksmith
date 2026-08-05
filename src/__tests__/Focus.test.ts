import { DAY_LIMIT, dayKey, focusSections, isUrgent } from "../query/Focus";
import { DaySelection, EMPTY_PLAN, type DayPlan } from "../views/DaySelection";
import { effectiveDate } from "../index/Buckets";
import { parseTaskLine, priorityOf } from "../index/TaskParser";
import { formatIsoDate } from "../index/dates";
import type { Task, TaskKind } from "../types/task";

const D = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y!, m! - 1, d!);
};
const TODAY = D("2026-08-05");

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

describe("isUrgent", () => {
  it("is true for a task dated today", () => {
    expect(isUrgent(task("- [ ] avui 📅 2026-08-05"), TODAY)).toBe(true);
  });

  it("is true for highest priority and for an urgent tag, whatever their date", () => {
    expect(isUrgent(task("- [ ] crema 🔺"), TODAY)).toBe(true);
    expect(isUrgent(task("- [ ] crema #urgent"), TODAY)).toBe(true);
    expect(isUrgent(task("- [ ] crema #URGENT 📅 2027-01-01"), TODAY)).toBe(true);
  });

  it("is false for an ordinary overdue or undated task", () => {
    expect(isUrgent(task("- [ ] tard 📅 2026-07-01"), TODAY)).toBe(false);
    expect(isUrgent(task("- [ ] sense data"), TODAY)).toBe(false);
  });

  it("is false once the task is closed", () => {
    expect(isUrgent(task("- [x] feta 📅 2026-08-05", { open: false }), TODAY)).toBe(false);
  });
});

describe("focusSections", () => {
  const tasks = [
    task("- [ ] avui 📅 2026-08-05"),
    task("- [ ] urgent sense data #urgent"),
    task("- [ ] endarrerida 📅 2026-07-01"),
    task("- [ ] molt endarrerida 📅 2026-03-11"),
    task("- [ ] sense data"),
    task("- [ ] triada"),
    task("- [ ] futur 📅 2026-09-01"),
    task("- [x] feta 📅 2026-07-01", { open: false }),
    task("- [ ] documentació", { kind: "reference" }),
    task("- [ ] idea", { kind: "someday" }),
  ];
  const chosen = [dayKey(tasks[5]!)];

  it("puts what arrived on its own first, and never in a chosen slot", () => {
    const s = focusSections({ tasks, chosen, today: TODAY });
    // The description keeps its tags, by design: the parser strips fields, not text.
    expect(s.urgent.map((t) => t.description)).toEqual(["avui", "urgent sense data #urgent"]);
    expect(s.chosen.map((t) => t.description)).toEqual(["triada"]);
    expect(s.free).toBe(DAY_LIMIT - 1);
  });

  it("sorts what is left to renegotiate oldest first", () => {
    const s = focusSections({ tasks, chosen, today: TODAY });
    expect(s.renegotiate.map((t) => t.description)).toEqual(["molt endarrerida", "endarrerida"]);
  });

  it("leaves closed, reference and someday lines out of every section", () => {
    const s = focusSections({ tasks, chosen, today: TODAY });
    const all = [...s.urgent, ...s.chosen, ...s.renegotiate, ...s.undated, ...s.later];
    expect(all.map((t) => t.description).sort()).toEqual(
      [
        "avui",
        "endarrerida",
        "futur",
        "molt endarrerida",
        "sense data",
        "triada",
        "urgent sense data #urgent",
      ].sort()
    );
  });

  it("shows a task once, even when it is both urgent and chosen", () => {
    const both = task("- [ ] totes dues 📅 2026-08-05");
    const s = focusSections({ tasks: [both], chosen: [dayKey(both)], today: TODAY });
    expect(s.urgent).toHaveLength(1);
    expect(s.chosen).toHaveLength(0);
  });

  it("keeps the chosen ones in the order they were chosen", () => {
    const a = task("- [ ] primera");
    const b = task("- [ ] segona");
    const s = focusSections({ tasks: [a, b], chosen: [dayKey(b), dayKey(a)], today: TODAY });
    expect(s.chosen.map((t) => t.description)).toEqual(["segona", "primera"]);
  });

  it("filters on text across description, note and people", () => {
    const withPerson = task("- [ ] parlar-hi", { people: ["Carmen"] });
    const s = focusSections({ tasks: [...tasks, withPerson], chosen: [], today: TODAY, text: "carmen" });
    const all = [...s.urgent, ...s.renegotiate, ...s.undated, ...s.later];
    expect(all.map((t) => t.description)).toEqual(["parlar-hi"]);
  });
});

describe("DaySelection", () => {
  function selection(stored: DayPlan = EMPTY_PLAN) {
    const saved: DayPlan[] = [];
    const day = new DaySelection(stored, (plan) => saved.push(plan), TODAY);
    return { day, saved };
  }

  it("holds three and refuses the fourth", () => {
    const { day } = selection();
    const four = [task("- [ ] a"), task("- [ ] b"), task("- [ ] c"), task("- [ ] d")];
    expect(four.slice(0, 3).every((t) => day.add(t, TODAY))).toBe(true);
    expect(day.isFull).toBe(true);
    expect(day.add(four[3]!, TODAY)).toBe(false);
    expect(day.size).toBe(3);
  });

  it("stamps the plan with today and persists every change", () => {
    const { day, saved } = selection();
    day.add(task("- [ ] a"), TODAY);
    expect(saved).toHaveLength(1);
    expect(saved[0]!.date).toBe(formatIsoDate(TODAY));
  });

  /** The rule that makes the day cost nothing: yesterday's plan is not a backlog. */
  it("forgets a plan made for another day", () => {
    const yesterday: DayPlan = { date: "2026-08-04", keys: ["01 Diari/nota.md|ahir"] };
    const { day } = selection(yesterday);
    expect(day.size).toBe(0);
  });

  it("keeps today's plan across a reload", () => {
    const today: DayPlan = { date: formatIsoDate(TODAY), keys: ["01 Diari/nota.md|avui"] };
    const { day } = selection(today);
    expect(day.keys()).toEqual(["01 Diari/nota.md|avui"]);
  });

  it("frees the slot of a task that has been completed or deleted", () => {
    const alive = task("- [ ] viva");
    const gone = task("- [ ] morta");
    const { day } = selection({ date: formatIsoDate(TODAY), keys: [dayKey(alive), dayKey(gone)] });
    day.prune([alive]);
    expect(day.keys()).toEqual([dayKey(alive)]);
    expect(day.isFull).toBe(false);
  });

  it("frees the slot when the task gets ticked off in the note", () => {
    const before = task("- [ ] la mateixa");
    const after = task("- [x] la mateixa", { open: false });
    const { day } = selection({ date: formatIsoDate(TODAY), keys: [dayKey(before)] });
    day.prune([after]);
    expect(day.size).toBe(0);
  });

  it("toggles the same task off", () => {
    const { day } = selection();
    const t = task("- [ ] a");
    day.add(t, TODAY);
    day.toggle(t, TODAY);
    expect(day.size).toBe(0);
  });

  /** `path:line` would break the moment a line is inserted above the task. */
  it("identifies a task by note and text, not by line number", () => {
    const before = task("- [ ] la mateixa", { location: { path: "a.md", line: 4 } });
    const moved = task("- [ ] la mateixa", { location: { path: "a.md", line: 9 } });
    expect(dayKey(before)).toBe(dayKey(moved));
  });
});
