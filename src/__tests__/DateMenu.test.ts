import { nextFriday, nextMonday, openDateMenu, type DateMenuCallbacks } from "../views/DateMenu";
import { Menu, SuggestModal } from "../__mocks__/obsidian";
import type { TaskActions } from "../tasks/TaskActions";
import { parseTaskLine } from "../index/TaskParser";
import { effectiveDate } from "../index/Buckets";
import { priorityOf } from "../index/TaskParser";
import type { Task } from "../types/task";

const D = (iso: string): Date => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y!, m! - 1, d);
};

const TODAY = D("2026-08-05");

function task(raw: string): Task {
  const parsed = parseTaskLine(raw);
  if (!parsed) throw new Error(raw);
  return {
    ...parsed,
    location: { path: "01 Diari/nota.md", line: 0 },
    project: null,
    area: null,
    people: [],
    noteTitle: null,
    noteType: null,
    noteDate: null,
    filenameDate: null,
    effectiveDate: effectiveDate(parsed, null),
    kind: "commitment",
    open: parsed.status === " ",
    priority: priorityOf(parsed),
    hasChildren: false,
  };
}

/** Enough of `TaskActions` to see which write each entry asked for, without touching a vault. */
function actionsStub() {
  const ok = () => Promise.resolve({ ok: true, line: "" } as const);
  const scheduleOn = jest.fn(ok);
  const stub = {
    scheduleOn,
    tomorrow: jest.fn(ok),
    nextWeek: jest.fn(ok),
    postpone: jest.fn(ok),
    clearDue: jest.fn(ok),
  };
  return { actions: stub as unknown as TaskActions, scheduleOn };
}

function callbacksStub(): DateMenuCallbacks & {
  onDrop: jest.Mock;
  onOpen: jest.Mock;
  onDone: jest.Mock;
  onReschedule: jest.Mock;
} {
  return {
    onDrop: jest.fn(async () => {}),
    onOpen: jest.fn(),
    onDone: jest.fn(),
    onReschedule: jest.fn(),
  };
}

async function click(title: string): Promise<void> {
  const menu = Menu.latest;
  if (!menu) throw new Error("no menu was opened");
  await menu.itemTitled(title).click();
}

describe("openDateMenu", () => {
  const app = {} as never;

  beforeEach(() => {
    Menu.latest = null;
    SuggestModal.latest = null;
  });

  /*
   * Postponing a task is you deciding, right now, that it is not part of today after all —
   * whichever slot it held (chosen, or arrived on its own) has to go with it. Every entry that
   * writes a new date, or clears one, has to say so.
   */
  it.each([
    ["Demà", () => {}],
    ["Divendres", () => {}],
    ["Dilluns que ve", () => {}],
    ["+1 setmana", () => {}],
    ["+1 mes", () => {}],
    ["Treure la data", () => {}],
  ])("tells the caller to give up the day's slot after \"%s\"", async (title) => {
    const { actions } = actionsStub();
    const callbacks = callbacksStub();
    const t = task("- [ ] revisar");

    openDateMenu(app, actions, t, {} as MouseEvent, callbacks);
    await click(title);

    expect(callbacks.onReschedule).toHaveBeenCalledWith(t);
    expect(callbacks.onDone).toHaveBeenCalled();
  });

  it("also gives up the slot after writing a date by hand", async () => {
    const { actions, scheduleOn } = actionsStub();
    const callbacks = callbacksStub();
    const t = task("- [ ] revisar");

    openDateMenu(app, actions, t, {} as MouseEvent, callbacks);
    // Not awaited: the click opens `DateInputModal`, whose promise only settles once the modal
    // below is told what was chosen, so awaiting the click itself here would deadlock.
    const clicked = Menu.latest!.itemTitled("Escriure una data…").click();
    const modal = SuggestModal.latest;
    if (!modal) throw new Error("no modal was opened");
    modal.onChooseSuggestion({ label: "Demà", date: D("2026-08-06") } as never, {} as MouseEvent);
    await clicked;

    expect(scheduleOn).toHaveBeenCalledWith(t, D("2026-08-06"));
    expect(callbacks.onReschedule).toHaveBeenCalledWith(t);
  });

  it("does not touch the day's slot just for opening the note", async () => {
    const { actions } = actionsStub();
    const callbacks = callbacksStub();
    const t = task("- [ ] revisar");

    openDateMenu(app, actions, t, {} as MouseEvent, callbacks);
    await click("Obrir la nota");

    expect(callbacks.onReschedule).not.toHaveBeenCalled();
    expect(callbacks.onOpen).toHaveBeenCalledWith(t);
  });

  /** "No ho faré" already forgets the slot through `onDrop`; it must not double up. */
  it("does not call onReschedule for \"No ho faré\", which the caller handles through onDrop", async () => {
    const { actions } = actionsStub();
    const callbacks = callbacksStub();
    const t = task("- [ ] revisar");

    openDateMenu(app, actions, t, {} as MouseEvent, callbacks);
    await click("No ho faré");


    expect(callbacks.onDrop).toHaveBeenCalledWith(t);
    expect(callbacks.onReschedule).not.toHaveBeenCalled();
    expect(callbacks.onDone).toHaveBeenCalled();
  });
});

describe("nextFriday / nextMonday", () => {
  it("land on the next occurrence of the weekday, today excluded", () => {
    expect(nextFriday(TODAY)).toEqual(D("2026-08-07"));
    expect(nextMonday(TODAY)).toEqual(D("2026-08-10"));
  });
});
