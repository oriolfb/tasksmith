import { isEmptyTask } from "../index/EmptyTasks";
import { hasIndentedChild, tasksFromFile } from "../index/buildTasks";
import { DEFAULT_INTEROP, type TasksInterop } from "../tasks/TasksPluginSettings";
import { filterTasks, DEFAULT_QUERY, bucketCounts, type QueryContext } from "../query/Query";

const interop: TasksInterop = {
  ...DEFAULT_INTEROP,
  useFilenameAsScheduledDate: true,
  filenameAsScheduledDateFormat: "\\D\\i\\a\\r\\i YYYY-MM-DD",
};

const TODAY = new Date(2026, 7, 5);
const ctx: QueryContext = { today: TODAY, mtimeOf: () => null, staleThresholdDays: 14 };

const build = (content: string, path = "01 Diari/2026/07/Diari 2026-07-24.md") =>
  tasksFromFile({ path, content }, interop);

describe("isEmptyTask", () => {
  it("flags the real template leftover", () => {
    // Exactly what "## ☑️ Noves tasques" leaves behind in the July daily notes.
    const [task] = build("## ☑️ Noves tasques\n- [ ] \n");
    expect(isEmptyTask(task!)).toBe(true);
  });

  it("flags a bare task with no trailing space", () => {
    expect(isEmptyTask(build("- [ ]")[0]!)).toBe(true);
  });

  it("tolerates a created date, which Tasks adds by itself", () => {
    expect(isEmptyTask(build("- [ ] ➕ 2026-07-24")[0]!)).toBe(true);
  });

  it("does not flag a task with any content", () => {
    for (const line of [
      "- [ ] fer alguna cosa",
      "- [ ] #kpi",
      "- [ ] [[GrowthBook]]",
      "- [ ] 📅 2026-08-10",
      "- [ ] 🔁 every week",
      "- [ ] 🆔 abc",
      "- [ ] ⏫",
      "- [x] ✅ 2026-07-24",
    ]) {
      expect(isEmptyTask(build(line)[0]!)).toBe(false);
    }
  });

  it("refuses to flag an empty parent that owns subtasks", () => {
    const tasks = build("- [ ] \n\t- [ ] la filla té contingut\n");
    expect(tasks[0]!.hasChildren).toBe(true);
    expect(isEmptyTask(tasks[0]!)).toBe(false);
  });

  it("flags an empty task whose next sibling is at the same level", () => {
    const tasks = build("- [ ] \n- [ ] germana amb text\n");
    expect(tasks[0]!.hasChildren).toBe(false);
    expect(isEmptyTask(tasks[0]!)).toBe(true);
  });
});

describe("hasIndentedChild", () => {
  it("skips blank lines before deciding", () => {
    expect(hasIndentedChild(["- [ ] a", "", "  - [ ] fill"], 0, 0)).toBe(true);
    expect(hasIndentedChild(["- [ ] a", "", "text normal"], 0, 0)).toBe(false);
  });

  it("is false at end of file", () => {
    expect(hasIndentedChild(["- [ ] a"], 0, 0)).toBe(false);
    expect(hasIndentedChild(["- [ ] a", "", ""], 0, 0)).toBe(false);
  });

  it("compares against the parent's own indentation", () => {
    expect(hasIndentedChild(["\t- [ ] a", "\t\t- [ ] fill"], 0, 1)).toBe(true);
    expect(hasIndentedChild(["\t- [ ] a", "- [ ] germana"], 0, 1)).toBe(false);
  });
});

describe("views never show empty tasks", () => {
  const tasks = build("- [ ] \n- [ ] real 📅 2026-08-10\n- [ ] ➕ 2026-07-24\n");

  it("filters them out of every query", () => {
    const visible = filterTasks(tasks, { ...DEFAULT_QUERY, statusScope: "all" }, ctx);
    expect(visible.map((t) => t.description)).toEqual(["real"]);
  });

  it("keeps them out of the bucket counts", () => {
    const counts = bucketCounts(tasks, TODAY);
    expect(
      counts.overdue + counts.today + counts.week + counts.nextWeek + counts.month + counts.later + counts.undated
    ).toBe(1);
  });
});
