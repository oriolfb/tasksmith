import { dayPlannerCandidates, dayPlannerDataSource, dayPlannerStage } from "../query/DayPlanner";
import { effectiveDate } from "../index/Buckets";
import { parseTaskLine, priorityOf } from "../index/TaskParser";
import { dayKey } from "../query/Focus";
import type { Task } from "../types/task";

const D = (iso: string): Date => {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year!, month! - 1, day);
};

const TODAY = D("2026-09-04");
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

describe("dayPlannerCandidates", () => {
  it("proposes overdue work before undated work, oldest first", () => {
    const undated = task("- [ ] sense data");
    const recent = task("- [ ] recent 📅 2026-09-01");
    const old = task("- [ ] antiga 📅 2026-07-01");

    const candidates = dayPlannerCandidates([undated, recent, old], [], [], TODAY);

    expect(candidates.map((candidate) => candidate.task.description)).toEqual(["antiga", "recent", "sense data"]);
    expect(candidates.map((candidate) => candidate.reason)).toEqual(["overdue", "overdue", "undated"]);
  });

  it("leaves out tasks already chosen, decided, closed, future-dated or non-commitments", () => {
    const chosen = task("- [ ] triada");
    const decided = task("- [ ] decidida");
    const closed = task("- [x] feta", { open: false });
    const future = task("- [ ] futura 📅 2026-09-20");
    const reference = task("- [ ] referència", { kind: "reference" });
    const urgent = task("- [ ] ja ha arribat sola #urgent");
    const eligible = task("- [ ] pendent");

    const candidates = dayPlannerCandidates(
      [chosen, decided, closed, future, reference, urgent, eligible],
      [dayKey(chosen)],
      [dayKey(decided)],
      TODAY
    );

    expect(candidates.map((candidate) => candidate.task.description)).toEqual(["pendent"]);
  });

  it("uses the note date to order otherwise undated tasks without treating it as a deadline", () => {
    const newer = task("- [ ] nova", { noteDate: D("2026-08-20") });
    const older = task("- [ ] vella", { noteDate: D("2026-07-10") });

    expect(dayPlannerCandidates([newer, older], [], [], TODAY).map((candidate) => candidate.task.description)).toEqual([
      "vella",
      "nova",
    ]);
  });
});

describe("dayPlannerStage", () => {
  it("stops proposing work for today when the three slots are full", () => {
    expect(dayPlannerStage(2, false)).toBe("choosing-today");
    expect(dayPlannerStage(3, false)).toBe("day-ready");
  });

  it("can continue through the remaining undefined tasks after today is full", () => {
    expect(dayPlannerStage(3, true)).toBe("planning-rest");
  });
});

describe("dayPlannerDataSource", () => {
  it("uses the persisted snapshot while the first live scan is still running", () => {
    const cached = [task("- [ ] disponible immediatament")];

    expect(dayPlannerDataSource(false, [], cached)).toEqual({ tasks: cached, live: false });
  });

  it("switches to the live index as soon as it is ready", () => {
    const cached = [task("- [ ] antiga")];
    const live = [task("- [ ] actual")];

    expect(dayPlannerDataSource(true, live, cached)).toEqual({ tasks: live, live: true });
  });

  it("shows loading only when neither source exists yet", () => {
    expect(dayPlannerDataSource(false, [], null)).toBeNull();
  });
});
