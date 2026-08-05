import { TFile } from "obsidian";
import { TaskWriter } from "../tasks/TaskWriter";
import { EmptyTaskCleaner } from "../tasks/EmptyTaskCleaner";
import { tasksFromFile } from "../index/buildTasks";
import { DEFAULT_INTEROP } from "../tasks/TasksPluginSettings";
import { setDateField } from "../index/TaskLineEditor";
import type { Task } from "../types/task";

/** Minimal in-memory vault exposing just what TaskWriter touches. */
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

describe("TaskWriter.deleteMany", () => {
  it("removes several lines from one file without shifting the others", () => {
    const content = ["# Nota", "- [ ] primera", "- [ ] segona", "- [ ] tercera", "text final"].join("\n");
    const files = { "a.md": content };
    const writer = new TaskWriter(fakeApp(files));
    const tasks = build("a.md", content);

    // Deliberately out of order: the writer must sort bottom-up itself.
    return writer.deleteMany([tasks[0]!, tasks[2]!]).then(({ deleted, skipped }) => {
      expect({ deleted, skipped }).toEqual({ deleted: 2, skipped: 0 });
      expect(files["a.md"]).toBe(["# Nota", "- [ ] segona", "text final"].join("\n"));
    });
  });

  it("spans multiple files", async () => {
    const files = { "a.md": "- [ ] a\nqueda", "b.md": "queda\n- [ ] b" };
    const writer = new TaskWriter(fakeApp(files));
    const tasks = [...build("a.md", files["a.md"]), ...build("b.md", files["b.md"])];

    const { deleted } = await writer.deleteMany(tasks);
    expect(deleted).toBe(2);
    expect(files["a.md"]).toBe("queda");
    expect(files["b.md"]).toBe("queda");
  });

  it("refuses to delete when the line on disk has changed", async () => {
    const original = "- [ ] original";
    const files = { "a.md": original };
    const writer = new TaskWriter(fakeApp(files));
    const tasks = build("a.md", original);

    files["a.md"] = "- [ ] algú l'ha editada";
    const { deleted, skipped } = await writer.deleteMany(tasks);

    expect({ deleted, skipped }).toEqual({ deleted: 0, skipped: 1 });
    expect(files["a.md"]).toBe("- [ ] algú l'ha editada");
  });

  it("deletes the stale ones and keeps the changed one in a mixed batch", async () => {
    const content = ["- [ ] una", "- [ ] dues", "- [ ] tres"].join("\n");
    const files = { "a.md": content };
    const writer = new TaskWriter(fakeApp(files));
    const tasks = build("a.md", content);

    files["a.md"] = ["- [ ] una", "- [ ] dues EDITADA", "- [ ] tres"].join("\n");
    const { deleted, skipped } = await writer.deleteMany(tasks);

    expect({ deleted, skipped }).toEqual({ deleted: 2, skipped: 1 });
    expect(files["a.md"]).toBe("- [ ] dues EDITADA");
  });

  it("reports a missing file instead of throwing", async () => {
    const content = "- [ ] a";
    const writer = new TaskWriter(fakeApp({}));
    const { deleted, skipped } = await writer.deleteMany(build("a.md", content));
    expect({ deleted, skipped }).toEqual({ deleted: 0, skipped: 1 });
  });
});

describe("TaskWriter.edit", () => {
  it("writes one line and leaves the rest byte-identical", async () => {
    const content = ["# Nota", "- [ ] tasca 📅 2026-01-01", "\t- [x] filla ✅ 2026-01-02", ""].join("\n");
    const files = { "a.md": content };
    const writer = new TaskWriter(fakeApp(files));
    const tasks = build("a.md", content);

    const result = await writer.edit(tasks[0]!, (parsed) => setDateField(parsed, "due", new Date(2026, 7, 5)));

    expect(result.ok).toBe(true);
    expect(files["a.md"]).toBe(
      ["# Nota", "- [ ] tasca 📅 2026-08-05", "\t- [x] filla ✅ 2026-01-02", ""].join("\n")
    );
  });

  it("abandons the write on conflict", async () => {
    const content = "- [ ] tasca";
    const files = { "a.md": content };
    const writer = new TaskWriter(fakeApp(files));
    const tasks = build("a.md", content);

    files["a.md"] = "- [ ] una altra cosa";
    const result = await writer.edit(tasks[0]!, (parsed) => setDateField(parsed, "due", new Date(2026, 7, 5)));

    expect(result).toEqual({ ok: false, reason: "conflict" });
    expect(files["a.md"]).toBe("- [ ] una altra cosa");
  });
});

describe("EmptyTaskCleaner", () => {
  const content = ["- [ ] ", "- [ ] real"].join("\n");

  function cleaner(files: Record<string, string>, active: string | null, enabled = true) {
    return new EmptyTaskCleaner(new TaskWriter(fakeApp(files)), {
      enabled: () => enabled,
      activePath: () => active,
    });
  }

  it("never touches the note being edited", async () => {
    const files = { "a.md": content };
    const removed = await cleaner(files, "a.md").clean(build("a.md", content));
    expect(removed).toBe(0);
    expect(files["a.md"]).toBe(content);
  });

  it("cleans the same note once it is no longer active", async () => {
    const files = { "a.md": content };
    const removed = await cleaner(files, "altra.md").clean(build("a.md", content));
    expect(removed).toBe(1);
    expect(files["a.md"]).toBe("- [ ] real");
  });

  it("does nothing when the setting is off", async () => {
    const files = { "a.md": content };
    const removed = await cleaner(files, null, false).clean(build("a.md", content));
    expect(removed).toBe(0);
    expect(files["a.md"]).toBe(content);
  });

  it("cleanPath only touches the requested note", async () => {
    const files = { "a.md": content, "b.md": content };
    const tasks = [...build("a.md", content), ...build("b.md", content)];
    const removed = await cleaner(files, null).cleanPath(tasks, "b.md");
    expect(removed).toBe(1);
    expect(files["a.md"]).toBe(content);
    expect(files["b.md"]).toBe("- [ ] real");
  });

  it("leaves an empty parent with subtasks alone", async () => {
    const nested = ["- [ ] ", "\t- [ ] filla"].join("\n");
    const files = { "a.md": nested };
    const removed = await cleaner(files, null).clean(build("a.md", nested));
    expect(removed).toBe(0);
    expect(files["a.md"]).toBe(nested);
  });
});
