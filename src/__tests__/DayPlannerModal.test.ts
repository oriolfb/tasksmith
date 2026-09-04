import { setLocale } from "../i18n/strings";
import { DEFAULT_SETTINGS } from "../settings/Config";
import type { Task } from "../types/task";
import { DayPlannerModal } from "../views/DayPlannerModal";

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
});
