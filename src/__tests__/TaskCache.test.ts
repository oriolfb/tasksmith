import { deserializeTaskCache, serializeTaskCache } from "../index/TaskCache";
import { parseTaskLine, priorityOf } from "../index/TaskParser";
import { effectiveDate } from "../index/Buckets";
import type { Task } from "../types/task";

function task(raw: string, extra: Partial<Task> = {}): Task {
  const parsed = parseTaskLine(raw);
  if (!parsed) throw new Error(raw);
  const filenameDate = extra.filenameDate ?? null;
  return {
    ...parsed,
    identityDescription: parsed.description,
    location: { path: "01 Diari/nota.md", line: 3 },
    project: "Projecte X",
    area: "01 Diari",
    people: ["Carmen"],
    noteTitle: "Nota",
    noteType: "diari",
    noteDate: new Date(2026, 7, 7),
    filenameDate,
    effectiveDate: effectiveDate(parsed, filenameDate),
    kind: "commitment",
    open: parsed.status === " ",
    priority: priorityOf(parsed),
    hasChildren: false,
    ...extra,
  };
}

describe("serializeTaskCache / deserializeTaskCache", () => {
  it("round-trips a task, dates included", () => {
    const original = task("- [ ] parlar amb la marina 📅 2026-08-20 ⏳ 2026-08-18 #important");
    const cache = serializeTaskCache([original], new Date(2026, 7, 12));
    const restored = deserializeTaskCache(cache);

    expect(restored).not.toBeNull();
    const [back] = restored!;
    expect(back).toEqual(original);
  });

  it("round-trips a task whose date fields are all null", () => {
    const original = task("- [ ] sense cap data");
    const restored = deserializeTaskCache(serializeTaskCache([original], new Date(2026, 7, 12)));
    expect(restored).toEqual([original]);
  });

  it("returns null for a missing cache", () => {
    expect(deserializeTaskCache(null)).toBeNull();
    expect(deserializeTaskCache(undefined)).toBeNull();
  });

  it("returns null rather than throwing for a shape it does not recognise", () => {
    expect(deserializeTaskCache({ tasks: "not an array" })).toBeNull();
    expect(deserializeTaskCache("garbage")).toBeNull();
    expect(deserializeTaskCache(42)).toBeNull();
  });
});
