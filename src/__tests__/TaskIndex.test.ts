import { TFile } from "obsidian";
import { TaskIndex } from "../index/TaskIndex";
import { ScopeFilter } from "../index/ScopeFilter";
import { DEFAULT_INTEROP } from "../tasks/TasksPluginSettings";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("TaskIndex rebuilds", () => {
  it("never lets an older scan overwrite a newer scope", async () => {
    const file = new TFile();
    file.path = "Treball/a.md";
    file.basename = "a";
    const firstRead = deferred<string>();
    let reads = 0;
    const app = {
      vault: {
        getMarkdownFiles: () => [file],
        cachedRead: () => {
          reads++;
          return firstRead.promise;
        },
      },
      metadataCache: { getFileCache: () => null },
    } as never;
    const index = new TaskIndex(app, new ScopeFilter([]), DEFAULT_INTEROP);

    const oldScan = index.rebuild();
    await Promise.resolve();
    index.setScope(new ScopeFilter(["Treball"]));
    const newScan = index.rebuild();
    firstRead.resolve("- [ ] no ha de tornar a aparèixer");

    await Promise.all([oldScan, newScan]);
    expect(index.all()).toEqual([]);
    expect(reads).toBe(1);
  });

  it("keeps the last known tasks and reports a file that temporarily fails", async () => {
    const file = new TFile();
    file.path = "a.md";
    file.basename = "a";
    let fail = false;
    const app = {
      vault: {
        getMarkdownFiles: () => [file],
        cachedRead: () => (fail ? Promise.reject(new Error("iCloud unavailable")) : Promise.resolve("- [ ] queda")),
      },
      metadataCache: { getFileCache: () => null },
    } as never;
    const index = new TaskIndex(app, new ScopeFilter([]), DEFAULT_INTEROP);

    await index.rebuild();
    fail = true;
    await index.rebuild();

    expect(index.all().map((task) => task.description)).toEqual(["queda"]);
    expect(index.failures).toEqual(["a.md"]);
  });
});
