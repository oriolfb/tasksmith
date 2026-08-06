import { BUCKET_ORDER, ageInDays, bucketOf, effectiveDate, isStale } from "../index/Buckets";
import { parseTaskLine } from "../index/TaskParser";
import { endOfWeek, formatIsoDate } from "../index/dates";
import type { Task } from "../types/task";
import { ScopeFilter, parseObsidianIgnoreFilters } from "../index/ScopeFilter";

const D = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y!, m! - 1, d);
};

const TODAY = D("2026-08-05"); // a Wednesday

function task(line: string, filenameDate: Date | null = null, open = true): Task {
  const parsed = parseTaskLine(line);
  if (!parsed) throw new Error(`not parsed: ${line}`);
  return {
    ...parsed,
    location: { path: "x.md", line: 0 },
    project: null,
    area: null,
    people: [],
    noteTitle: null,
    noteType: null,
    noteDate: null,
    filenameDate,
    effectiveDate: effectiveDate(parsed, filenameDate),
    kind: "commitment",
    open,
    priority: null,
    hasChildren: false,
  };
}

describe("effectiveDate precedence", () => {
  it("prefers due over scheduled over start over the note's own date", () => {
    expect(formatIsoDate(task("- [ ] a 🛫 2026-01-03 ⏳ 2026-01-02 📅 2026-01-01").effectiveDate!)).toBe("2026-01-01");
    expect(formatIsoDate(task("- [ ] a 🛫 2026-01-03 ⏳ 2026-01-02").effectiveDate!)).toBe("2026-01-02");
    expect(formatIsoDate(task("- [ ] a 🛫 2026-01-03").effectiveDate!)).toBe("2026-01-03");
    expect(formatIsoDate(task("- [ ] a", D("2026-06-18")).effectiveDate!)).toBe("2026-06-18");
    expect(task("- [ ] a").effectiveDate).toBeNull();
  });

  it("gives a daily-note task a date even with no emoji — the whole point of the rule", () => {
    const buried = task("- [ ] validar les dades que m'ha passat la carmen", D("2026-06-18"));
    expect(bucketOf(buried, TODAY)).toBe("overdue");
  });
});

describe("bucketOf", () => {
  it("puts every open task in exactly one bucket", () => {
    expect(bucketOf(task("- [ ] a 📅 2026-08-04"), TODAY)).toBe("overdue");
    expect(bucketOf(task("- [ ] a 📅 2026-08-05"), TODAY)).toBe("today");
    expect(bucketOf(task("- [ ] a 📅 2026-08-09"), TODAY)).toBe("week"); // Sunday
    expect(bucketOf(task("- [ ] a 📅 2026-08-10"), TODAY)).toBe("later"); // next Monday
    expect(bucketOf(task("- [ ] a"), TODAY)).toBe("undated");
  });

  it("treats a closed task as closed whatever its date", () => {
    expect(bucketOf(task("- [x] a 📅 2026-01-01", null, false), TODAY)).toBe("closed");
    expect(bucketOf(task("- [-] a", null, false), TODAY)).toBe("closed");
  });

  it("ends the week on Sunday", () => {
    expect(formatIsoDate(endOfWeek(TODAY))).toBe("2026-08-09");
    expect(formatIsoDate(endOfWeek(D("2026-08-09")))).toBe("2026-08-09");
    expect(formatIsoDate(endOfWeek(D("2026-08-10")))).toBe("2026-08-16");
  });

  it("covers all buckets in BUCKET_ORDER", () => {
    expect(new Set(BUCKET_ORDER).size).toBe(BUCKET_ORDER.length);
    expect(BUCKET_ORDER).toContain("undated");
  });
});

describe("staleness", () => {
  it("ages from the created date when present", () => {
    expect(ageInDays(task("- [ ] a ➕ 2026-07-22 📅 2026-09-01"), null, TODAY)).toBe(14);
    expect(isStale(task("- [ ] a ➕ 2026-07-22"), null, 14, TODAY)).toBe(true);
    expect(isStale(task("- [ ] a ➕ 2026-08-01"), null, 14, TODAY)).toBe(false);
  });

  it("falls back to the note's date, then to mtime", () => {
    expect(ageInDays(task("- [ ] a", D("2026-07-06")), null, TODAY)).toBe(30);
    expect(ageInDays(task("- [ ] a"), D("2026-08-01").getTime(), TODAY)).toBe(4);
    expect(ageInDays(task("- [ ] a"), null, TODAY)).toBeNull();
  });

  it("never marks a closed task stale", () => {
    expect(isStale(task("- [x] a ➕ 2020-01-01", null, false), null, 14, TODAY)).toBe(false);
  });
});

describe("ScopeFilter", () => {
  const filter = new ScopeFilter(["99 xTemplates/", "97 xScripts/", "96 IA Docs", "07 Arxiu", ".claude"]);

  it("excludes folders and their contents, nothing else", () => {
    expect(filter.includes("01 Diari/2026/03/Diari 2026-03-10.md")).toBe(true);
    expect(filter.includes("99 xTemplates/plantilla.md")).toBe(false);
    expect(filter.includes("96 IA Docs/convencions-format.md")).toBe(false);
    expect(filter.includes(".claude/skills/x/SKILL.md")).toBe(false);
    // A folder whose name merely starts with an excluded name must stay indexed.
    expect(filter.includes("07 Arxiu Viu/nota.md")).toBe(true);
  });

  it("reads Obsidian's own excluded files setting", () => {
    expect(parseObsidianIgnoreFilters(JSON.stringify({ userIgnoreFilters: ["99 xTemplates/", "97 xScripts/"] }))).toEqual([
      "99 xTemplates/",
      "97 xScripts/",
    ]);
    expect(parseObsidianIgnoreFilters("broken")).toEqual([]);
  });
});
