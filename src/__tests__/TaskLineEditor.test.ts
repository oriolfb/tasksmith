import { applyEdits, removeField, setDateField, setPriority, setStatus } from "../index/TaskLineEditor";
import { parseTaskLine } from "../index/TaskParser";

const parse = (line: string) => {
  const task = parseTaskLine(line);
  if (!task) throw new Error(`not parsed: ${line}`);
  return task;
};

const D = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y!, m! - 1, d);
};

describe("surgical edits", () => {
  it("replaces an existing due date and touches nothing else", () => {
    const line = "- [ ] Slaide -> plantilla de ppt 📅 2026-06-30 ✅ 2026-07-01";
    expect(setDateField(parse(line), "due", D("2026-08-05"))).toBe(
      "- [ ] Slaide -> plantilla de ppt 📅 2026-08-05 ✅ 2026-07-01"
    );
  });

  it("inserts a due date in canonical position, before done", () => {
    const line = "- [x] Reservar vols ✅ 2026-02-17";
    expect(setDateField(parse(line), "due", D("2026-02-16"))).toBe(
      "- [x] Reservar vols 📅 2026-02-16 ✅ 2026-02-17"
    );
  });

  it("appends a due date when there are no later fields", () => {
    expect(setDateField(parse("- [ ] sense data"), "due", D("2026-08-05"))).toBe(
      "- [ ] sense data 📅 2026-08-05"
    );
  });

  it("drops a trailing space instead of doubling it", () => {
    expect(setDateField(parse("- [ ] amb espai final "), "due", D("2026-08-05"))).toBe(
      "- [ ] amb espai final 📅 2026-08-05"
    );
  });

  it("removes a field without leaving double spaces", () => {
    const line = "- [ ] tasca 📅 2026-06-30 ✅ 2026-07-01";
    expect(removeField(parse(line), "due")).toBe("- [ ] tasca ✅ 2026-07-01");
    expect(removeField(parse(line), "done")).toBe("- [ ] tasca 📅 2026-06-30");
  });

  it("returns the line untouched when removing an absent field", () => {
    const line = "- [ ] tasca";
    expect(removeField(parse(line), "due")).toBe(line);
  });

  it("changes only the status character, preserving tab indentation", () => {
    const line = "\t- [ ] subtasca 📅 2026-06-30";
    expect(setStatus(parse(line), "/")).toBe("\t- [/] subtasca 📅 2026-06-30");
  });

  it("puts priority before recurrence and dates", () => {
    const line = "- [ ] tasca 🔁 every week 📅 2026-06-30";
    expect(setPriority(parse(line), "high")).toBe("- [ ] tasca ⏫ 🔁 every week 📅 2026-06-30");
  });

  it("replaces one priority marker with another", () => {
    const line = "- [ ] tasca ⏫ 📅 2026-06-30";
    expect(setPriority(parse(line), "low")).toBe("- [ ] tasca 🔽 📅 2026-06-30");
  });

  it("preserves text the parser does not model", () => {
    // The empty ⏳ stays part of the description and must survive an edit.
    const line = "- [x] Revisar alemania ⏳ 📅 2026-02-06 ✅ 2026-02-20";
    expect(setDateField(parse(line), "due", D("2026-03-01"))).toBe(
      "- [x] Revisar alemania ⏳ 📅 2026-03-01 ✅ 2026-02-20"
    );
  });

  it("chains edits by re-parsing between them", () => {
    const line = "- [ ] tasca";
    const result = applyEdits(line, [
      (task) => setDateField(task, "due", D("2026-08-05")),
      (task) => setStatus(task, "x"),
      (task) => setDateField(task, "done", D("2026-08-05")),
    ]);
    expect(result).toBe("- [x] tasca 📅 2026-08-05 ✅ 2026-08-05");
  });

  it("round-trips: setting a field to its current value is a no-op", () => {
    const lines = [
      "- [x] Reservar vols 📅 2026-02-16 ✅ 2026-02-17",
      "- [ ] Recurrent 🔁 every week 📅 2026-06-30",
      "\t- [x] hablar con armando 📅 2026-01-29 ✅ 2026-02-09",
      "- [-] Convocar 📅 2026-02-18 ❌ 2026-03-02",
    ];
    for (const line of lines) {
      const task = parse(line);
      expect(setDateField(task, "due", task.fields.due!.date!)).toBe(line.trimEnd());
    }
  });
});
