import { TFile } from "obsidian";
import { TaskWriter } from "../tasks/TaskWriter";
import { History } from "../tasks/History";
import { EmptyTaskCleaner } from "../tasks/EmptyTaskCleaner";
import { tasksFromFile } from "../index/buildTasks";
import { DEFAULT_INTEROP } from "../tasks/TasksPluginSettings";
import { setDateField } from "../index/TaskLineEditor";
import { DEFAULT_SETTINGS } from "../settings/Config";
import type { Task } from "../types/task";

function fakeApp(files: Record<string, string>) {
  return {
    vault: {
      getAbstractFileByPath: (path: string) => {
        if (!(path in files)) return null;
        const file = new TFile();
        file.path = path;
        return file;
      },
      process: async (file: TFile, fn: (content: string) => string) => {
        files[file.path] = fn(files[file.path] ?? "");
      },
    },
  } as never;
}

const build = (path: string, content: string): Task[] =>
  tasksFromFile({ path, content }, DEFAULT_INTEROP);

describe("History", () => {
  it("keeps at most `limit` entries, dropping the oldest", () => {
    const history = new History(2);
    for (const label of ["a", "b", "c"]) history.record(label, [{ path: "x.md", line: 0, before: "1", after: "2" }]);
    expect(history.size).toBe(2);
    expect(history.pop()?.label).toBe("c");
    expect(history.pop()?.label).toBe("b");
    expect(history.pop()).toBeNull();
  });

  it("folds every write between begin and commit into one entry", () => {
    const history = new History();
    history.begin("lot");
    history.record("ignorada", [{ path: "a.md", line: 1, before: "1", after: "2" }]);
    history.record("ignorada", [{ path: "b.md", line: 4, before: "3", after: "4" }]);
    history.commit();

    expect(history.size).toBe(1);
    const entry = history.pop();
    expect(entry?.label).toBe("lot");
    expect(entry?.records).toHaveLength(2);
  });

  it("does not push an empty group", () => {
    const history = new History();
    history.begin("res");
    history.commit();
    expect(history.size).toBe(0);
  });
});

describe("TaskWriter.undo", () => {
  it("restores the previous text of an edited line", async () => {
    const content = ["# Nota", "- [ ] tasca 📅 2026-01-01", "text final"].join("\n");
    const files = { "a.md": content };
    const writer = new TaskWriter(fakeApp(files));
    const tasks = build("a.md", content);

    await writer.edit(tasks[0]!, (parsed) => setDateField(parsed, "due", new Date(2026, 7, 5)));
    expect(files["a.md"]).toContain("📅 2026-08-05");

    const result = await writer.undo();
    expect(result).toEqual({ ok: true, label: "Editar la tasca", restored: 1, skipped: 0 });
    expect(files["a.md"]).toBe(content);
  });

  it("puts a deleted line back where it was", async () => {
    const content = ["# Nota", "- [ ] primera", "- [ ] segona", "final"].join("\n");
    const files = { "a.md": content };
    const writer = new TaskWriter(fakeApp(files));

    await writer.deleteLine(build("a.md", content)[0]!);
    expect(files["a.md"]).toBe(["# Nota", "- [ ] segona", "final"].join("\n"));

    const result = await writer.undo();
    expect(result.ok).toBe(true);
    expect(files["a.md"]).toBe(content);
  });

  it("finds the original neighbours when lines moved after a deletion", async () => {
    const content = ["# Nota", "- [ ] primera", "text final"].join("\n");
    const files = { "a.md": content };
    const writer = new TaskWriter(fakeApp(files));

    await writer.deleteLine(build("a.md", content)[0]!);
    files["a.md"] = ["introducció nova", files["a.md"]].join("\n");

    const result = await writer.undo();
    expect(result).toEqual({ ok: true, label: "Eliminar la tasca", restored: 1, skipped: 0 });
    expect(files["a.md"]).toBe(["introducció nova", "# Nota", "- [ ] primera", "text final"].join("\n"));
  });

  it("restores a multi-line deletion to the exact original, across files", async () => {
    const a = ["- [ ] una", "entremig", "- [ ] dues", "- [ ] tres"].join("\n");
    const b = ["capçalera", "- [ ] altra"].join("\n");
    const files = { "a.md": a, "b.md": b };
    const writer = new TaskWriter(fakeApp(files));
    const tasks = [...build("a.md", a), ...build("b.md", b)];

    const { deleted } = await writer.deleteMany(tasks, "Eliminar 4 tasques");
    expect(deleted).toBe(4);

    const result = await writer.undo();
    expect(result).toEqual({ ok: true, label: "Eliminar 4 tasques", restored: 4, skipped: 0 });
    expect(files["a.md"]).toBe(a);
    expect(files["b.md"]).toBe(b);
  });

  it("undoes a grouped bulk edit in a single step", async () => {
    const content = ["- [ ] una", "- [ ] dues", "- [ ] tres"].join("\n");
    const files = { "a.md": content };
    const writer = new TaskWriter(fakeApp(files));
    const tasks = build("a.md", content);

    writer.history.begin("Avui · 3 tasques");
    for (const task of tasks) {
      await writer.edit(task, (parsed) => setDateField(parsed, "due", new Date(2026, 7, 5)));
    }
    writer.history.commit();
    expect(writer.history.size).toBe(1);

    const result = await writer.undo();
    expect(result).toEqual({ ok: true, label: "Avui · 3 tasques", restored: 3, skipped: 0 });
    expect(files["a.md"]).toBe(content);
  });

  it("refuses to overwrite a line that changed after the write", async () => {
    const content = "- [ ] tasca";
    const files = { "a.md": content };
    const writer = new TaskWriter(fakeApp(files));

    await writer.edit(build("a.md", content)[0]!, (parsed) => setDateField(parsed, "due", new Date(2026, 7, 5)));
    files["a.md"] = "- [ ] algú l'ha reescrit a mà";

    const result = await writer.undo();
    expect(result).toEqual({ ok: true, label: "Editar la tasca", restored: 0, skipped: 1 });
    expect(files["a.md"]).toBe("- [ ] algú l'ha reescrit a mà");
  });

  it("does not duplicate a deleted line the user retyped", async () => {
    const content = ["- [ ] primera", "final"].join("\n");
    const files = { "a.md": content };
    const writer = new TaskWriter(fakeApp(files));

    await writer.deleteLine(build("a.md", content)[0]!);
    files["a.md"] = content; // typed back by hand

    const result = await writer.undo();
    expect(result).toEqual({ ok: true, label: "Eliminar la tasca", restored: 0, skipped: 1 });
    expect(files["a.md"]).toBe(content);
  });

  it("reports an empty history instead of throwing", async () => {
    const writer = new TaskWriter(fakeApp({}));
    expect(await writer.undo()).toEqual({ ok: false, reason: "empty" });
  });

  it("only ever undoes one entry at a time, newest first", async () => {
    const content = ["- [ ] una", "- [ ] dues"].join("\n");
    const files = { "a.md": content };
    const writer = new TaskWriter(fakeApp(files));
    const tasks = build("a.md", content);

    await writer.edit(tasks[0]!, () => "- [ ] una EDITADA", "primer canvi");
    await writer.edit(tasks[1]!, () => "- [ ] dues EDITADA", "segon canvi");

    expect((await writer.undo()) as { label: string }).toMatchObject({ label: "segon canvi" });
    expect(files["a.md"]).toBe(["- [ ] una EDITADA", "- [ ] dues"].join("\n"));

    expect((await writer.undo()) as { label: string }).toMatchObject({ label: "primer canvi" });
    expect(files["a.md"]).toBe(content);
  });
});

describe("empty-task cleaning is opt-in and reversible", () => {
  it("is off in the shipped defaults", () => {
    expect(DEFAULT_SETTINGS.autoDeleteEmptyTasks).toBe(false);
  });

  it("records one undo step for the whole batch", async () => {
    const content = ["- [ ] ", "- [ ] real", "- [ ] "].join("\n");
    const files = { "a.md": content };
    const writer = new TaskWriter(fakeApp(files));
    const cleaner = new EmptyTaskCleaner(writer, { enabled: () => true, activePath: () => null });

    const removed = await cleaner.clean(build("a.md", content));
    expect(removed).toBe(2);
    expect(files["a.md"]).toBe("- [ ] real");
    expect(writer.history.size).toBe(1);
    expect(writer.history.peekLabel()).toBe("Eliminar 2 tasques buides");

    await writer.undo();
    expect(files["a.md"]).toBe(content);
  });
});
