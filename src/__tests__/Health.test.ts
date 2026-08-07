import { healthFindings, type Finding } from "../query/Health";
import { effectiveDate } from "../index/Buckets";
import { parseTaskLine, priorityOf } from "../index/TaskParser";
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
    project: "Projecte X",
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

const ctx = { today: TODAY, staleThresholdDays: 14 };

function find(findings: Finding[], key: string): Finding | undefined {
  return findings.find((finding) => finding.key === key);
}

describe("healthFindings", () => {
  it("says nothing about cancellations until something has been closed", () => {
    expect(find(healthFindings([task("- [ ] oberta")], ctx), "no-cancellations")).toBeUndefined();
  });

  it("reports never having cancelled anything, with the span in months", () => {
    const tasks = [
      task("- [x] una ✅ 2025-12-01", { open: false }),
      task("- [x] dues ✅ 2026-08-01", { open: false }),
      task("- [ ] endarrerida 📅 2026-01-01"),
    ];
    const finding = find(healthFindings(tasks, ctx), "no-cancellations")!;
    expect(finding.title).toBe("Cap tasca cancel·lada en 8 mesos");
    expect(finding.detail).toContain("2 tancades");
    // The action is the whole point: it points the table at the tasks to renegotiate.
    expect(finding.filter).toMatchObject({ buckets: ["overdue"], sort: "age" });
  });

  it("stops reporting it as soon as one task has been cancelled", () => {
    const tasks = [
      task("- [x] una ✅ 2026-01-05", { open: false }),
      task("- [-] dues ❌ 2026-02-05", { open: false }),
      task("- [ ] endarrerida 📅 2026-01-01"),
    ];
    const findings = healthFindings(tasks, ctx);
    expect(find(findings, "no-cancellations")).toBeUndefined();
    // Two closings, one of them cancelled, is not a low rate either.
    expect(find(findings, "few-cancellations")).toBeUndefined();
  });

  it("flags a cancellation rate that rounds to nothing", () => {
    const tasks = [
      ...Array.from({ length: 99 }, (_, i) => task(`- [x] feta ${i} ✅ 2026-03-02`, { open: false })),
      task("- [-] l'única ❌ 2026-03-03", { open: false }),
      task("- [ ] endarrerida 📅 2026-01-01"),
    ];
    expect(find(healthFindings(tasks, ctx), "few-cancellations")?.title).toBe(
      "Només 1 de 100 tancades s'han cancel·lat"
    );
  });

  it("stays quiet about the cancellation rate when there is nothing open to renegotiate", () => {
    // Same shape as the "rounds to nothing" case above, minus the open overdue task: the
    // action would open an empty table, so the finding is noise rather than something to fix.
    const tasks = [
      ...Array.from({ length: 99 }, (_, i) => task(`- [x] feta ${i} ✅ 2026-03-02`, { open: false })),
      task("- [-] l'única ❌ 2026-03-03", { open: false }),
    ];
    const findings = healthFindings(tasks, ctx);
    expect(find(findings, "few-cancellations")).toBeUndefined();
    expect(find(findings, "no-cancellations")).toBeUndefined();
  });

  it("points at undated tasks whose note has a date, rather than dating them itself", () => {
    const tasks = [
      task("- [ ] de la reunió", { noteDate: D("2026-07-27") }),
      task("- [ ] sense res enlloc"),
      task("- [ ] ja té data 📅 2026-08-20", { noteDate: D("2026-07-27") }),
    ];
    const finding = find(healthFindings(tasks, ctx), "undated-with-note-date")!;
    expect(finding.title).toBe("1 sense data que la nota sí que té");
    // The action is a filter the user reviews task by task, never a batch write.
    expect(finding.filter).toMatchObject({ buckets: ["undated"], noteDatableOnly: true });
  });

  it("counts notes without a project, not tasks", () => {
    const tasks = [
      task("- [ ] una", { project: null, location: { path: "01 Diari/a.md", line: 1 } }),
      task("- [ ] dues", { project: null, location: { path: "01 Diari/a.md", line: 2 } }),
      task("- [ ] tres", { project: null, location: { path: "01 Diari/b.md", line: 1 } }),
      task("- [ ] quatre", { location: { path: "01 Diari/c.md", line: 1 } }),
    ];
    expect(find(healthFindings(tasks, ctx), "notes-without-project")?.title).toBe(
      "2 notes amb tasques obertes i sense «Projecte»"
    );
  });

  it("uses the age rule, not the deadline, to call something stale", () => {
    const tasks = [
      // Dated tomorrow but written down five weeks ago: still stale.
      task("- [ ] antiga 📅 2026-08-06", { noteDate: D("2026-07-01") }),
      task("- [ ] d'ahir", { noteDate: D("2026-08-04") }),
    ];
    const finding = find(healthFindings(tasks, ctx), "stale")!;
    expect(finding.title).toBe("1 apuntades fa més de 14 dies");
    expect(finding.detail).toContain("35 dies");
    expect(finding.filter).toMatchObject({ staleOnly: true });
  });

  it("mentions the empty lines and says whether they are cleaned automatically", () => {
    const tasks = [task("- [ ] "), task("- [ ] de veritat")];
    expect(find(healthFindings(tasks, ctx), "empty-tasks")?.detail).toContain(
      "Eliminar les tasques buides ara"
    );
    expect(
      find(healthFindings(tasks, { ...ctx, autoDeleteEmptyTasks: true }), "empty-tasks")?.detail
    ).toContain("S'esborraran soles");
  });

  it("reports the excluded documentation as the system working, not as a problem", () => {
    const tasks = [task("- [ ] checklist", { kind: "reference" }), task("- [ ] tasca")];
    const finding = find(healthFindings(tasks, ctx), "reference-lines")!;
    expect(finding.tone).toBe("ok");
    expect(finding.filter).toMatchObject({ includeReference: true });
  });

  it("only draws the index line when it was told what was scanned", () => {
    const tasks = [task("- [ ] tasca")];
    expect(find(healthFindings(tasks, ctx), "index")).toBeUndefined();
    expect(find(healthFindings(tasks, { ...ctx, notes: 865, lines: 474 }), "index")?.detail).toContain(
      "865 notes"
    );
  });

  it("puts everything to fix before everything that is merely true", () => {
    const tasks = [
      task("- [x] feta ✅ 2026-01-05", { open: false }),
      task("- [ ] endarrerida 📅 2026-06-29", { project: null }),
      task("- [ ] checklist", { kind: "reference" }),
    ];
    const tones = healthFindings(tasks, { ...ctx, notes: 10, lines: 20 }).map((f) => f.tone);
    expect(tones).toContain("warn");
    expect(tones).toContain("ok");
    expect(tones.lastIndexOf("warn")).toBeLessThan(tones.indexOf("ok"));
  });

  it("gives every finding a distinct key, so the panel cannot show one twice", () => {
    const tasks = [
      task("- [x] feta ✅ 2026-01-05", { open: false }),
      task("- [ ] endarrerida 📅 2026-06-29", { project: null, noteDate: D("2026-06-29") }),
      task("- [ ] "),
      task("- [ ] checklist", { kind: "reference" }),
    ];
    const keys = healthFindings(tasks, { ...ctx, notes: 10, lines: 20 }).map((f) => f.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("has nothing to say about a vault with nothing in it", () => {
    expect(healthFindings([], ctx)).toEqual([]);
  });
});
