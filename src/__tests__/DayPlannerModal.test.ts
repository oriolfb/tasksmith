import { setLocale } from "../i18n/strings";
import { DEFAULT_SETTINGS } from "../settings/Config";
import type { Task } from "../types/task";
import { DayPlannerModal } from "../views/DayPlannerModal";
import { EMPTY_PLAN, type DayPlan } from "../views/DaySelection";
import { DAY_LIMIT, dayKey } from "../query/Focus";
import { formatIsoDate, startOfToday } from "../index/dates";
import { parseTaskLine } from "../index/TaskParser";
import type { TaskActions } from "../tasks/TaskActions";

interface FakeButton {
  text: string;
  click(): void;
}

function buttonHost(): { host: HTMLElement; buttons: FakeButton[] } {
  const buttons: FakeButton[] = [];
  const host = {
    createEl: (_tag: string, options: { text: string }) => {
      let click = () => {};
      const button = {
        addEventListener: (_event: string, handler: () => void) => {
          click = handler;
        },
      };
      buttons.push({ text: options.text, click: () => click() });
      return button;
    },
  };
  return { host: host as unknown as HTMLElement, buttons };
}

describe("DayPlannerModal", () => {
  it("lets a proposed task be completed and moves on", async () => {
    setLocale("ca");
    const complete = jest.fn().mockResolvedValue({ ok: true, line: "- [x] feta" });
    const modal = new DayPlannerModal(
      {} as never,
      { ready: false, all: () => [] } as never,
      { complete } as never,
      { ...DEFAULT_SETTINGS, dayPlan: { date: "", keys: [], done: [], slotted: [] } },
      async () => {},
      () => {}
    );
    const task = {
      description: "tasca que ja estava feta",
      identityDescription: "tasca que ja estava feta",
      location: { path: "nota.md", line: 0 },
    } as Task;
    const { host, buttons } = buttonHost();

    (
      modal as unknown as {
        renderTodayActions(host: HTMLElement, task: Task, today: Date): void;
      }
    ).renderTodayActions(host, task, new Date(2026, 8, 4));

    const done = buttons.find((button) => button.text === "Ja està feta");
    expect(done).toBeDefined();
    done?.click();
    await Promise.resolve();
    await Promise.resolve();

    expect(complete).toHaveBeenCalledWith(task);
  });

  it("tells the host to repaint after a write, not just after a plan change", async () => {
    // Postponing from the planner changes the note, not the plan, so the dock's own refresh
    // never fired: it sat on the old rows until Obsidian's metadata event caught up. The
    // sidebar refreshes itself after its own writes; the planner has to say so out loud.
    setLocale("ca");
    const tomorrow = jest.fn().mockResolvedValue({ ok: true, line: "- [ ] a 📅 2026-09-05" });
    const refreshViews = jest.fn();
    const modal = new DayPlannerModal(
      {} as never,
      { ready: false, all: () => [] } as never,
      { tomorrow } as never,
      { ...DEFAULT_SETTINGS, dayPlan: { date: "", keys: [], done: [], slotted: [] } },
      async () => {},
      refreshViews
    );
    const task = {
      description: "aplaçada",
      identityDescription: "aplaçada",
      location: { path: "nota.md", line: 0 },
    } as Task;
    const { host, buttons } = buttonHost();

    (
      modal as unknown as {
        renderRestActions(host: HTMLElement, task: Task, today: Date): void;
      }
    ).renderRestActions(host, task, new Date(2026, 8, 4));

    buttons.find((button) => button.text === "Demà")?.click();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(tomorrow).toHaveBeenCalledWith(task);
    expect(refreshViews).toHaveBeenCalled();
  });
});

/**
 * A recording stand-in for Obsidian's element helpers, enough to run the modal's own `render`
 * in a node test: the assistant's copy, the plan's slots and every button end up inspectable.
 */
class El {
  readonly children: El[] = [];
  text: string;
  private handler: (() => void) | null = null;

  constructor(
    readonly tag = "div",
    options: { text?: string; cls?: string } = {}
  ) {
    this.text = options.text ?? "";
  }

  empty(): void {
    this.children.length = 0;
  }
  createDiv(options: { text?: string; cls?: string } = {}): El {
    return this.child("div", options);
  }
  createSpan(options: { text?: string; cls?: string } = {}): El {
    return this.child("span", options);
  }
  createEl(tag: string, options: { text?: string; cls?: string } = {}): El {
    return this.child(tag, options);
  }
  setText(text: string): void {
    this.text = text;
  }
  appendText(text: string): void {
    this.text += text;
  }
  addClass(): void {}
  removeClass(): void {}
  toggleClass(): void {}
  setAttribute(): void {}
  addEventListener(_event: string, handler: () => void): void {
    this.handler = handler;
  }

  private child(tag: string, options: { text?: string; cls?: string }): El {
    const el = new El(tag, options);
    this.children.push(el);
    return el;
  }

  flat(): El[] {
    return [this, ...this.children.flatMap((child) => child.flat())];
  }
  texts(): string[] {
    return this.flat().map((el) => el.text).filter((text) => text !== "");
  }
  click(label: string): void {
    const button = this.flat().find((el) => el.tag === "button" && el.text === label);
    if (!button) throw new Error(`no button "${label}" in ${JSON.stringify(this.texts())}`);
    button.handler?.();
  }
}

function planner(tasks: Task[], plan: DayPlan, extra: Partial<TaskActions> = {}) {
  const settings = { ...DEFAULT_SETTINGS, dayPlan: plan };
  const modal = new DayPlannerModal(
    {} as never,
    { ready: true, all: () => tasks } as never,
    extra as never,
    settings,
    async () => {},
    () => {}
  );
  const content = new El();
  (modal as unknown as { contentEl: El }).contentEl = content;
  const render = () => (modal as unknown as { render(): void }).render();
  return { modal, settings, content, render };
}

let line = 0;
function open(description: string, extra: Partial<Task> = {}): Task {
  const parsed = parseTaskLine(`- [ ] ${description}`);
  if (!parsed) throw new Error(description);
  return {
    ...parsed,
    identityDescription: parsed.description,
    location: { path: "nota.md", line: line++ },
    project: null,
    area: null,
    people: [],
    noteTitle: null,
    noteType: null,
    noteDate: null,
    filenameDate: null,
    effectiveDate: null,
    kind: "commitment",
    open: true,
    priority: null,
    hasChildren: false,
    ...extra,
  };
}

describe("DayPlannerModal rendering", () => {
  beforeEach(() => setLocale("ca"));

  it("counts down the tasks still needing a decision as you skip them", () => {
    const tasks = [open("primera"), open("segona"), open("tercera")];
    const { content, render } = planner(tasks, EMPTY_PLAN);

    render();
    expect(content.texts()).toContain("Bon dia. Hi ha 3 tasques que encara necessiten una decisió. Te'n proposaré una cada vegada.");

    content.click("Una altra");
    expect(content.texts()).toContain("Bon dia. Hi ha 2 tasques que encara necessiten una decisió. Te'n proposaré una cada vegada.");
  });

  it("keeps a chosen task's slot readable when the index has not caught up with it", () => {
    // An empty index is not a vault without tasks, so the plan is deliberately not pruned
    // against it. The slot still belongs to a task, and its number is already spoken for:
    // painting "Encara lliure" over it reads as a pick that was lost.
    const plan: DayPlan = {
      date: formatIsoDate(startOfToday()),
      keys: ["nota.md|fer l'informe"],
      done: [],
      slotted: ["nota.md|fer l'informe"],
    };
    const { content, render } = planner([], plan);

    render();

    expect(content.texts()).toContain("fer l'informe");
    // The other two slots are genuinely free; the taken one is not.
    expect(content.texts().filter((text) => text === "Encara lliure")).toHaveLength(DAY_LIMIT - 1);
  });

  it("says so instead of doing nothing when the three slots are taken", () => {
    const plan: DayPlan = {
      date: formatIsoDate(startOfToday()),
      keys: ["nota.md|una", "nota.md|dues", "nota.md|tres"],
      done: [],
      slotted: ["nota.md|una", "nota.md|dues", "nota.md|tres"],
    };
    const { modal, content } = planner([], plan);
    const task = open("la quarta");

    (
      modal as unknown as { renderTodayActions(host: El, task: Task, today: Date): void }
    ).renderTodayActions(content, task, startOfToday());
    content.click("Afegeix-la a avui");

    expect((modal as unknown as { status: string }).status).toBe(
      "Ja tens 3 tasques per avui. Treu-ne una abans d'afegir-hi cap altra."
    );
  });

  it("records a task finished here in the day, so it shows up as done today", () => {
    const task = open("ja estava feta");
    const complete = jest.fn().mockResolvedValue({ ok: true, line: "- [x] ja estava feta" });
    const { modal, settings } = planner([task], EMPTY_PLAN, { complete });

    return (modal as unknown as { complete(task: Task, rest: boolean): Promise<void> })
      .complete(task, false)
      .then(() => {
        expect(settings.dayPlan.done).toEqual([dayKey(task)]);
      });
  });
});
