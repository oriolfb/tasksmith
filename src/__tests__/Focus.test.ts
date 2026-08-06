import { DAY_LIMIT, dayKey, focusSections, isUrgent } from "../query/Focus";
import { DaySelection, EMPTY_PLAN, type DayPlan } from "../views/DaySelection";
import { effectiveDate } from "../index/Buckets";
import { parseTaskLine, priorityOf } from "../index/TaskParser";
import { formatIsoDate } from "../index/dates";
import type { Task, TaskKind } from "../types/task";

const D = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y!, m! - 1, d);
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
    kind: "commitment",
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

  /** Pressing «Avui» on a task that already carries today's date has to do something visible. */
  it("shows a task once, and choosing it wins over its urgency", () => {
    const both = task("- [ ] totes dues 📅 2026-08-05");
    const s = focusSections({ tasks: [both], chosen: [dayKey(both)], today: TODAY });
    expect(s.urgent).toHaveLength(0);
    expect(s.chosen).toHaveLength(1);
    expect(s.free).toBe(DAY_LIMIT - 1);
  });

  it("keeps the chosen ones in the order they were chosen", () => {
    const a = task("- [ ] primera");
    const b = task("- [ ] segona");
    const s = focusSections({ tasks: [a, b], chosen: [dayKey(b), dayKey(a)], today: TODAY });
    expect(s.chosen.map((t) => t.description)).toEqual(["segona", "primera"]);
  });

  it("keeps what you ticked off today, and only that, out of the closed lines", () => {
    const feta = task("- [x] triada i feta", { open: false });
    const s = focusSections({
      tasks: [...tasks, feta],
      chosen,
      done: [dayKey(feta)],
      today: TODAY,
    });
    expect(s.done.map((t) => t.description)).toEqual(["triada i feta"]);
    // "feta 📅 2026-07-01" is closed too, and nobody asked for it: it stays in the wide view.
    expect(s.renegotiate.map((t) => t.description)).not.toContain("feta");
  });

  it("does not let a finished task hold one of the three slots", () => {
    const feta = task("- [x] ja està", { open: false });
    const s = focusSections({ tasks: [feta], chosen: [], done: [dayKey(feta)], today: TODAY });
    expect(s.free).toBe(DAY_LIMIT);
  });

  it("keeps the finished ones in the order they fell", () => {
    const first = task("- [x] primera", { open: false });
    const second = task("- [x] segona", { open: false });
    const s = focusSections({
      tasks: [second, first],
      chosen: [],
      done: [dayKey(first), dayKey(second)],
      today: TODAY,
    });
    expect(s.done.map((t) => t.description)).toEqual(["primera", "segona"]);
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
    const yesterday: DayPlan = { date: "2026-08-04", keys: ["01 Diari/nota.md|ahir"], done: [] };
    const { day } = selection(yesterday);
    expect(day.size).toBe(0);
  });

  /** Including what you did: the record is today's, and midnight ends it. */
  it("forgets yesterday's record too", () => {
    const yesterday: DayPlan = { date: "2026-08-04", keys: [], done: ["01 Diari/nota.md|ahir"] };
    const { day } = selection(yesterday);
    expect(day.doneKeys()).toEqual([]);
  });

  it("keeps today's plan across a reload", () => {
    const today: DayPlan = { date: formatIsoDate(TODAY), keys: ["01 Diari/nota.md|avui"], done: [] };
    const { day } = selection(today);
    expect(day.keys()).toEqual(["01 Diari/nota.md|avui"]);
  });

  /** 0.2.2 wrote a plan with no `done` at all. */
  it("reads a stored plan that predates the record", () => {
    const old = { date: formatIsoDate(TODAY), keys: ["01 Diari/nota.md|avui"] } as DayPlan;
    const { day } = selection(old);
    expect(day.doneKeys()).toEqual([]);
    expect(day.keys()).toEqual(["01 Diari/nota.md|avui"]);
  });

  it("frees the slot of a task that has been deleted", () => {
    const alive = task("- [ ] viva");
    const gone = task("- [ ] morta");
    const { day } = selection({
      date: formatIsoDate(TODAY),
      keys: [dayKey(alive), dayKey(gone)],
      done: [],
    });
    day.prune([alive]);
    expect(day.keys()).toEqual([dayKey(alive)]);
    expect(day.doneKeys()).toEqual([]);
    expect(day.isFull).toBe(false);
  });

  /**
   * The slot opens, the line stays. Ticking a task off in the note — not in the view — has to end
   * the same way it does here, or the record would depend on where you happened to click.
   */
  it("frees the slot but keeps the record when the task gets ticked off in the note", () => {
    const before = task("- [ ] la mateixa");
    const after = task("- [x] la mateixa", { open: false });
    const { day } = selection({ date: formatIsoDate(TODAY), keys: [dayKey(before)], done: [] });
    day.prune([after]);
    expect(day.size).toBe(0);
    expect(day.doneKeys()).toEqual([dayKey(after)]);
  });

  it("drops the record of a task that no longer exists", () => {
    const alive = task("- [ ] viva");
    const gone = task("- [x] esborrada", { open: false });
    const { day } = selection({ date: formatIsoDate(TODAY), keys: [], done: [dayKey(gone)] });
    day.prune([alive]);
    expect(day.doneKeys()).toEqual([]);
  });

  /**
   * The regression that lost a day's plan on every Obsidian start: the sidebar paints before the
   * first scan of the vault has finished, so it pruned against an index that was not empty but
   * unknown — and wrote the empty result back to disk.
   */
  it("keeps the plan when there is nothing to reconcile against yet", () => {
    const chosen = task("- [ ] triada");
    const done = task("- [x] tancada", { open: false });
    const stored: DayPlan = { date: formatIsoDate(TODAY), keys: [dayKey(chosen)], done: [dayKey(done)] };
    const { day, saved } = selection(stored);

    day.prune([]);

    expect(day.keys()).toEqual([dayKey(chosen)]);
    expect(day.doneKeys()).toEqual([dayKey(done)]);
    expect(saved).toEqual([]);
  });

  it("records what you tick off and stamps the day, even with nothing chosen", () => {
    const { day, saved } = selection();
    const urgent = task("- [x] crema #urgent", { open: false });
    day.markDone(urgent, TODAY);
    expect(day.doneKeys()).toEqual([dayKey(urgent)]);
    expect(day.size).toBe(0);
    expect(saved[0]!.date).toBe(formatIsoDate(TODAY));
  });

  it("gives a reopened task its slot back, and takes it off the record", () => {
    const t = task("- [ ] tornem-hi");
    const { day } = selection({ date: formatIsoDate(TODAY), keys: [], done: [dayKey(t)] });
    day.reopened(t, TODAY);
    expect(day.doneKeys()).toEqual([]);
    expect(day.keys()).toEqual([dayKey(t)]);
  });

  it("reopens without a slot when the three are taken", () => {
    const t = task("- [ ] tornem-hi");
    const three = ["a", "b", "c"].map((n) => `01 Diari/nota.md|${n}`);
    const { day } = selection({ date: formatIsoDate(TODAY), keys: three, done: [dayKey(t)] });
    day.reopened(t, TODAY);
    expect(day.doneKeys()).toEqual([]);
    expect(day.keys()).toEqual(three);
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
