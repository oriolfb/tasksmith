import { isTaskLine, parseTaskLine, priorityOf } from "../index/TaskParser";
import { formatIsoDate } from "../index/dates";

const parse = (line: string) => {
  const task = parseTaskLine(line);
  if (!task) throw new Error(`not parsed: ${line}`);
  return task;
};

describe("isTaskLine", () => {
  it.each([
    ["- [ ] a", true],
    ["- [x] a", true],
    ["\t- [x] a", true],
    ["    - [/] a", true],
    ["* [-] a", true],
    ["+ [ ] a", true],
    // Real line from 03 Projectes/IA: indented with four EM SPACEs (U+2003).
    ["    * [ ] tarea", true],
    ["> - [ ] dins un callout", true],
    ["1. [ ] llista numerada", true],
    ["- a", false],
    ["-[ ] a", false],
    ["## - [ ] a", false],
    ["", false],
  ])("%j -> %s", (line, expected) => {
    expect(isTaskLine(line)).toBe(expected);
  });
});

describe("field parsing", () => {
  it("reads the vault's canonical shape", () => {
    const task = parse("- [x] Reservar vols 📅 2026-02-16 ✅ 2026-02-17");
    expect(task.status).toBe("x");
    expect(task.description).toBe("Reservar vols");
    expect(formatIsoDate(task.fields.due!.date!)).toBe("2026-02-16");
    expect(formatIsoDate(task.fields.done!.date!)).toBe("2026-02-17");
  });

  it("keeps a valueless marker in the description instead of inventing a date", () => {
    // Real line from the vault: an empty ⏳ sitting in front of the due date.
    const task = parse("- [x] Revisar alemania a final de año fiscal ⏳ 📅 2026-02-06 ✅ 2026-02-20");
    expect(task.fields.scheduled).toBeUndefined();
    expect(task.description).toBe("Revisar alemania a final de año fiscal ⏳");
    expect(formatIsoDate(task.fields.due!.date!)).toBe("2026-02-06");
  });

  it("does not accept a template placeholder as a date", () => {
    const task = parse("- [ ] Descripción 📅 YYYY-MM-DD");
    expect(task.fields.due).toBeUndefined();
    expect(task.description).toBe("Descripción 📅 YYYY-MM-DD");
  });

  it("rejects impossible dates", () => {
    const task = parse("- [ ] boom 📅 2026-02-31");
    expect(task.fields.due?.date).toBeNull();
  });

  it("reads recurrence followed by a due date", () => {
    const task = parse("- [ ] Recurrent 🔁 every week 📅 2026-06-30");
    expect(task.fields.recurrence?.value).toBe("every week");
    expect(formatIsoDate(task.fields.due!.date!)).toBe("2026-06-30");
    expect(task.description).toBe("Recurrent");
  });

  it("reads cancelled tasks", () => {
    const task = parse("- [-] Convocar a algú de studio flow y pacman 📅 2026-02-18 ❌ 2026-03-02");
    expect(task.status).toBe("-");
    expect(formatIsoDate(task.fields.cancelled!.date!)).toBe("2026-03-02");
  });

  it("tolerates a trailing space after the last field", () => {
    const task = parse("- [ ] Slaide -> plantilla de ppt 📅 2026-06-30 ");
    expect(formatIsoDate(task.fields.due!.date!)).toBe("2026-06-30");
    expect(task.description).toBe("Slaide -> plantilla de ppt");
  });

  it("handles an emoji glued to the text with no space", () => {
    const task = parse("- [ ] preparar un punto para ver la situación de zenit📅 2026-09-05");
    expect(formatIsoDate(task.fields.due!.date!)).toBe("2026-09-05");
    expect(task.description).toBe("preparar un punto para ver la situación de zenit");
  });

  it("keeps tab indentation and reports it", () => {
    const task = parse("\t- [x] hablar con armando 📅 2026-01-29 ✅ 2026-02-09");
    expect(task.indent).toBe("\t");
    expect(task.statusOffset).toBe(4);
    expect(task.raw[task.statusOffset]).toBe("x");
  });

  it("finds the status character whatever the indentation", () => {
    for (const line of [
      "- [ ] a",
      "\t- [x] a",
      "    * [ ] a",
      "> - [/] a",
      "1. [-] a",
    ]) {
      const task = parse(line);
      expect(task.raw[task.statusOffset]).toBe(task.status);
    }
  });

  it("collects tags and wikilinks from the description", () => {
    const task = parse("- [x] actualitzar status [[GrowthBook]] a la Carmen #kpi 📅 2025-12-10");
    expect(task.links).toEqual(["GrowthBook"]);
    expect(task.tags).toEqual(["#kpi"]);
  });

  it("strips tags out of the description, wherever they sit in the line", () => {
    const leading = parse("- [ ] #task Crear la nova presentació de in your shoes 📅 2026-08-07");
    expect(leading.tags).toEqual(["#task"]);
    expect(leading.description).toBe("Crear la nova presentació de in your shoes");

    const trailing = parse("- [x] actualitzar status a la Carmen #kpi 📅 2025-12-10");
    expect(trailing.tags).toEqual(["#kpi"]);
    expect(trailing.description).toBe("actualitzar status a la Carmen");
  });

  it("reads every priority marker", () => {
    expect(priorityOf(parse("- [ ] a 🔺"))).toBe("highest");
    expect(priorityOf(parse("- [ ] a ⏫"))).toBe("high");
    expect(priorityOf(parse("- [ ] a 🔼"))).toBe("medium");
    expect(priorityOf(parse("- [ ] a 🔽"))).toBe("low");
    expect(priorityOf(parse("- [ ] a ⏬"))).toBe("lowest");
    expect(priorityOf(parse("- [ ] a"))).toBeNull();
  });

  it("reads id and created fields", () => {
    const task = parse("- [ ] amb id 🆔 abc123 ➕ 2026-01-02 📅 2026-01-09");
    expect(task.fields.id?.value).toBe("abc123");
    expect(formatIsoDate(task.fields.created!.date!)).toBe("2026-01-02");
    expect(task.description).toBe("amb id");
  });

  it("spans point at the exact field text", () => {
    const line = "- [ ] tasca 📅 2026-03-01";
    const task = parse(line);
    const span = task.fields.due!.span;
    expect(line.slice(span.start, span.end)).toBe(" 📅 2026-03-01");
  });
});
