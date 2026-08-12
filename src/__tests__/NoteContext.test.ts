import { parseFrontmatterBlock } from "../index/Frontmatter";
import {
  areaOf,
  noteDateOf,
  peopleOf,
  projectOf,
  tagsOf,
  titleOf,
  typeOf,
} from "../index/NoteContext";
import { DEFAULT_CONTEXT_RULES, grantsDeadline, kindOf } from "../index/ContextRules";
import { tasksFromFile } from "../index/buildTasks";
import { DEFAULT_INTEROP } from "../tasks/TasksPluginSettings";
import { formatIsoDate } from "../index/dates";
import { dayKey } from "../query/Focus";

/** Copied verbatim from a real meeting note, block lists and empty keys included. */
const MEETING = `---
data: 2026-07-27
tipus: reunió
estat: actiu
Resum: Sessió de feedback semestral amb la Carmen.
Persones:
  - "[[Carmen]]"
  - "[[Mireia]]"
Disciplina:
  - "[[Data]]"
Àrea:
  - "[[IA]]"
  - "[[Producte Digital]]"
Projecte:
Eina:
tags: [feedback, Reunió]
title: Feedback Carmen Juliol 2026
---

- [ ] Oriol: definir l'estructura d'equip pel pla 2030
`;

const DAILY = `---
data: 2026-07-13
tags: [Nota_Diaria]
---

- [ ] parlar amb el Javi
`;

const WEEKLY = `---
data: 2026-07-13
tags: [Nota_Setmanal]
title: Notes Setmana 29 2026
---

- [ ] #task Respondre Rocío Duarte
`;

const DOCS = `---
data: 2026-05-07
tipus: documentacio
tags: [documentacio, IA]
---

- [ ] Descripción 📅 YYYY-MM-DD
`;

describe("parseFrontmatterBlock", () => {
  it("reads scalars, inline lists and block lists from a real note", () => {
    const fm = parseFrontmatterBlock(MEETING)!;
    expect(fm["tipus"]).toBe("reunió");
    expect(fm["Persones"]).toEqual(["[[Carmen]]", "[[Mireia]]"]);
    expect(fm["tags"]).toEqual(["feedback", "Reunió"]);
    expect(fm["title"]).toBe("Feedback Carmen Juliol 2026");
  });

  it("treats a key with nothing under it as absent, not as a value", () => {
    const fm = parseFrontmatterBlock(MEETING)!;
    expect(projectOf(fm)).toBeNull();
    expect(typeof fm["Eina"]).toBe("string");
    expect(fm["Eina"]).toBe("");
  });

  it("returns undefined when there is no frontmatter at all", () => {
    expect(parseFrontmatterBlock("- [ ] just a task")).toBeUndefined();
    expect(parseFrontmatterBlock("---\nno closing fence")).toBeUndefined();
  });
});

describe("reading the note's context", () => {
  const fm = parseFrontmatterBlock(MEETING)!;

  it("takes every person, wikilinks unwrapped", () => {
    expect(peopleOf(fm)).toEqual(["Carmen", "Mireia"]);
  });

  it("takes the first area but keeps it readable", () => {
    expect(areaOf(fm)).toBe("IA");
  });

  it("reads title, type and date", () => {
    expect(titleOf(fm)).toBe("Feedback Carmen Juliol 2026");
    expect(typeOf(fm)).toBe("reunió");
    expect(formatIsoDate(noteDateOf(fm)!)).toBe("2026-07-27");
  });

  it("accepts a Date, as Obsidian sometimes parses `data:` itself", () => {
    const parsed = noteDateOf({ data: new Date(2026, 6, 27, 13, 45) });
    expect(formatIsoDate(parsed!)).toBe("2026-07-27");
  });

  it("ignores a date it cannot read rather than guessing", () => {
    expect(noteDateOf({ data: "27/07/2026" })).toBeNull();
    expect(noteDateOf({ data: "YYYY-MM-DD" })).toBeNull();
    expect(noteDateOf({})).toBeNull();
  });

  it("normalises tags whatever shape they were written in", () => {
    expect(tagsOf({ tags: "#Nota_Diaria" })).toEqual(["Nota_Diaria"]);
    expect(tagsOf({ tags: ["a", "#b"] })).toEqual(["a", "b"]);
  });
});

describe("which notes lend their date as a deadline", () => {
  it("periodic notes do, by default", () => {
    expect(grantsDeadline(DEFAULT_CONTEXT_RULES, ["Nota_Diaria"], null)).toBe(true);
    expect(grantsDeadline(DEFAULT_CONTEXT_RULES, ["Nota_Setmanal"], null)).toBe(true);
  });

  it("meetings and ideas do not", () => {
    expect(grantsDeadline(DEFAULT_CONTEXT_RULES, ["Reunió"], "reunió")).toBe(false);
    expect(grantsDeadline(DEFAULT_CONTEXT_RULES, ["actiu"], "idea")).toBe(false);
  });

  it("matches a `tipus` value too, so the list can be widened without new code", () => {
    const rules = { ...DEFAULT_CONTEXT_RULES, deadlineFrom: ["reunió"] };
    expect(grantsDeadline(rules, [], "reunió")).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(grantsDeadline(DEFAULT_CONTEXT_RULES, ["nota_diaria"], null)).toBe(true);
  });
});

describe("kindOf", () => {
  it("calls documentation notes reference, by default", () => {
    expect(kindOf(DEFAULT_CONTEXT_RULES, "documentacio")).toBe("reference");
  });

  it("leaves everything else a commitment until configured otherwise", () => {
    expect(kindOf(DEFAULT_CONTEXT_RULES, "idea")).toBe("commitment");
    expect(kindOf(DEFAULT_CONTEXT_RULES, "reunió")).toBe("commitment");
    expect(kindOf(DEFAULT_CONTEXT_RULES, null)).toBe("commitment");
    expect(kindOf({ ...DEFAULT_CONTEXT_RULES, somedayTypes: ["idea"] }, "idea")).toBe("someday");
  });
});

describe("tasksFromFile with the note's context", () => {
  const build = (path: string, content: string) =>
    tasksFromFile({ path, content }, DEFAULT_INTEROP);

  it("gives a weekly note's task the note's own date", () => {
    const [task] = build("01 Diari/2026/07/Diari setmana 29 de 2026.md", WEEKLY);
    // The filename has no date in it: this is exactly the case that used to fall through.
    expect(task!.filenameDate).toBeNull();
    expect(formatIsoDate(task!.effectiveDate!)).toBe("2026-07-13");
    expect(task!.noteTitle).toBe("Notes Setmana 29 2026");
  });

  it("does not turn a meeting date into a deadline", () => {
    const [task] = build("02 Reunions/Feedback.md", MEETING);
    expect(task!.effectiveDate).toBeNull();
    // ...but the date is still there, which is what "jotted down five weeks ago" needs.
    expect(formatIsoDate(task!.noteDate!)).toBe("2026-07-27");
    expect(task!.people).toEqual(["Carmen", "Mireia"]);
  });

  it("still prefers the filename convention when the Tasks plugin provides one", () => {
    // The vault's own setting. The filename says the 14th, the frontmatter the 13th.
    const interop = {
      ...DEFAULT_INTEROP,
      useFilenameAsScheduledDate: true,
      filenameAsScheduledDateFormat: "\\D\\i\\a\\r\\i YYYY-MM-DD",
    };
    const [task] = tasksFromFile({ path: "01 Diari/Diari 2026-07-14.md", content: DAILY }, interop);
    expect(formatIsoDate(task!.filenameDate!)).toBe("2026-07-14");
    expect(formatIsoDate(task!.effectiveDate!)).toBe("2026-07-14");
  });

  it("falls back to `data:` for a daily note when that Tasks setting is off", () => {
    const [task] = build("01 Diari/Diari 2026-07-13.md", DAILY);
    expect(task!.filenameDate).toBeNull();
    expect(formatIsoDate(task!.effectiveDate!)).toBe("2026-07-13");
  });

  it("marks a template line inside a documentation note as reference", () => {
    const [task] = build("05 Coneixement/IA/CLAUDE - Plantilla equip.md", DOCS);
    expect(task!.kind).toBe("reference");
  });
});

describe("tasksFromFile with a \"Nom:\" prefix", () => {
  it("assigns the task to a known person and strips the prefix", () => {
    const content = "- [ ] Carmen: fer algo\n";
    const [task] = tasksFromFile({ path: "x.md", content }, DEFAULT_INTEROP, undefined, new Set(["Carmen"]));
    expect(task!.description).toBe("fer algo");
    expect(task!.people).toEqual(["Carmen"]);
  });

  it("merges with the note's own Persones without duplicating", () => {
    const [task] = tasksFromFile(
      { path: "02 Reunions/Feedback.md", content: MEETING },
      DEFAULT_INTEROP,
      undefined,
      new Set(["Oriol"])
    );
    expect(task!.description).toBe("definir l'estructura d'equip pel pla 2030");
    expect(task!.people).toEqual(["Carmen", "Mireia", "Oriol"]);
  });

  it("leaves an unrecognised prefix untouched", () => {
    const content = "- [ ] Idea: explorar una opció\n";
    const [task] = tasksFromFile({ path: "x.md", content }, DEFAULT_INTEROP, undefined, new Set(["Carmen"]));
    expect(task!.description).toBe("Idea: explorar una opció");
    expect(task!.people).toEqual([]);
  });

  it("keeps the same day-plan identity whether or not the name is known yet", () => {
    // Before the vault's first full scan, or between incremental reindexes, a name can be
    // "known" on one pass and not on another — the same line must not change identity because
    // of it, or a task already chosen for today drops out the moment the prefix starts/stops
    // stripping.
    const content = "- [ ] Carmen: fer algo\n";
    const [beforeKnown] = tasksFromFile({ path: "x.md", content }, DEFAULT_INTEROP, undefined, new Set());
    const [afterKnown] = tasksFromFile({ path: "x.md", content }, DEFAULT_INTEROP, undefined, new Set(["Carmen"]));
    expect(dayKey(beforeKnown!)).toBe(dayKey(afterKnown!));
  });
});
