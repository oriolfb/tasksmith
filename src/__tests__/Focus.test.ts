import { DAY_LIMIT, dayKey, focusSections, isUrgent, wasUrgent } from "../query/Focus";
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
    identityDescription: parsed.description,
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

describe("wasUrgent", () => {
  it("is true for a closed task that would be urgent were it still open", () => {
    expect(wasUrgent(task("- [x] feta 📅 2026-08-05", { open: false }), TODAY)).toBe(true);
    expect(wasUrgent(task("- [x] feta #urgent", { open: false }), TODAY)).toBe(true);
  });

  it("is false for a closed task with no urgent signal", () => {
    expect(wasUrgent(task("- [x] feta", { open: false }), TODAY)).toBe(false);
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
    // Tags are collected separately and stripped from the description.
    expect(s.urgent.map((t) => t.description)).toEqual(["avui", "urgent sense data"]);
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
        "urgent sense data",
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

  /**
   * A finished pick does not read as arrived on its own: it holds its ordinal and stays out of
   * `done`, the list reserved for tasks that were never one of the three.
   */
  it("keeps a finished pick apart from a task that arrived and closed on its own", () => {
    const pick = task("- [x] triada i tancada", { open: false });
    const arrived = task("- [x] arribada i tancada #urgent", { open: false });
    const s = focusSections({
      tasks: [pick, arrived],
      chosen: [],
      done: [dayKey(pick), dayKey(arrived)],
      slotted: [dayKey(pick)],
      today: TODAY,
    });
    expect(s.doneChosen.map((t) => t.description)).toEqual(["triada i tancada"]);
    expect(s.done.map((t) => t.description)).toEqual(["arribada i tancada"]);
  });

  it("gives every slotted key a stable ordinal, in pick order, whether open or finished", () => {
    const first = task("- [ ] primera");
    const second = task("- [x] segona", { open: false });
    const third = task("- [ ] tercera");
    const s = focusSections({
      tasks: [first, second, third],
      chosen: [dayKey(first), dayKey(third)],
      done: [dayKey(second)],
      slotted: [dayKey(first), dayKey(second), dayKey(third)],
      today: TODAY,
    });
    expect(s.ordinals.get(dayKey(first))).toBe(1);
    expect(s.ordinals.get(dayKey(second))).toBe(2);
    expect(s.ordinals.get(dayKey(third))).toBe(3);
    // Finishing the second pick did not shift the third one's number down to 2.
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

  it("keeps a finished pick's ordinal in slottedKeys instead of freeing it like keys()", () => {
    const { day } = selection();
    const a = task("- [ ] a");
    const b = task("- [ ] b");
    day.add(a, TODAY);
    day.add(b, TODAY);
    day.markDone(a, TODAY);
    // `keys()` frees `a`'s slot so a fourth pick is possible; `slottedKeys()` still remembers it
    // held the first one, which is what keeps its row from renumbering or moving.
    expect(day.keys()).toEqual([dayKey(b)]);
    expect(day.slottedKeys()).toEqual([dayKey(a), dayKey(b)]);
  });

  it("stamps the plan with today and persists every change", () => {
    const { day, saved } = selection();
    day.add(task("- [ ] a"), TODAY);
    expect(saved).toHaveLength(1);
    expect(saved[0]!.date).toBe(formatIsoDate(TODAY));
  });

  /** The rule that makes the day cost nothing: yesterday's plan is not a backlog. */
  it("forgets a plan made for another day", () => {
    const yesterday: DayPlan = {
      date: "2026-08-04",
      keys: ["01 Diari/nota.md|ahir"],
      done: [],
      slotted: ["01 Diari/nota.md|ahir"],
    };
    const { day } = selection(yesterday);
    expect(day.size).toBe(0);
  });

  /** Including what you did: the record is today's, and midnight ends it. */
  it("forgets yesterday's record too", () => {
    const yesterday: DayPlan = {
      date: "2026-08-04",
      keys: [],
      done: ["01 Diari/nota.md|ahir"],
      slotted: ["01 Diari/nota.md|ahir"],
    };
    const { day } = selection(yesterday);
    expect(day.doneKeys()).toEqual([]);
  });

  it("keeps today's plan across a reload", () => {
    const today: DayPlan = {
      date: formatIsoDate(TODAY),
      keys: ["01 Diari/nota.md|avui"],
      done: [],
      slotted: ["01 Diari/nota.md|avui"],
    };
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
      slotted: [dayKey(alive), dayKey(gone)],
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
    const { day } = selection({
      date: formatIsoDate(TODAY),
      keys: [dayKey(before)],
      done: [],
      slotted: [dayKey(before)],
    });
    day.prune([after]);
    expect(day.size).toBe(0);
    expect(day.doneKeys()).toEqual([dayKey(after)]);
  });

  /**
   * The bug: an urgent task (due today) was never picked as one of the three, then got ticked
   * off directly in the note. `focusSections` only shows a closed, unchosen task under "Fetes
   * avui" when its key is in `done` — so if `prune` never notices it, marking it done from the
   * note silently drops it off today's record entirely.
   */
  it("records an urgent task ticked off in the note even though it was never chosen", () => {
    const chosen = task("- [ ] triada");
    const closed = task("- [x] crema 📅 2026-08-05", { open: false });
    const { day } = selection({
      date: formatIsoDate(TODAY),
      keys: [dayKey(chosen)],
      done: [],
      slotted: [dayKey(chosen)],
    });
    day.prune([chosen, closed], TODAY);
    expect(day.doneKeys()).toEqual([dayKey(closed)]);
  });

  it("records an urgent task ticked off in the note even with nothing chosen yet today", () => {
    const { day } = selection();
    const closed = task("- [x] crema #urgent", { open: false });
    day.prune([closed], TODAY);
    expect(day.doneKeys()).toEqual([dayKey(closed)]);
  });

  it("does not record a closed task that was never chosen and never urgent", () => {
    const { day } = selection();
    const closed = task("- [x] tasca normal", { open: false });
    day.prune([closed], TODAY);
    expect(day.doneKeys()).toEqual([]);
  });

  it("drops the record of a task that no longer exists", () => {
    const alive = task("- [ ] viva");
    const gone = task("- [x] esborrada", { open: false });
    const { day } = selection({
      date: formatIsoDate(TODAY),
      keys: [],
      done: [dayKey(gone)],
      slotted: [dayKey(gone)],
    });
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
    const stored: DayPlan = {
      date: formatIsoDate(TODAY),
      keys: [dayKey(chosen)],
      done: [dayKey(done)],
      slotted: [dayKey(chosen), dayKey(done)],
    };
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
    const { day } = selection({
      date: formatIsoDate(TODAY),
      keys: [],
      done: [dayKey(t)],
      slotted: [dayKey(t)],
    });
    day.reopened(t, TODAY);
    expect(day.doneKeys()).toEqual([]);
    expect(day.keys()).toEqual([dayKey(t)]);
  });

  it("reopens without a slot when the three are taken", () => {
    const t = task("- [ ] tornem-hi");
    const three = ["a", "b", "c"].map((n) => `01 Diari/nota.md|${n}`);
    const { day } = selection({
      date: formatIsoDate(TODAY),
      keys: three,
      done: [dayKey(t)],
      slotted: [...three, dayKey(t)],
    });
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
