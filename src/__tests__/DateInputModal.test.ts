import { DateInputModal } from "../views/DateInputModal";
// Imported by path, not as "obsidian": the same module the mapper hands the plugin, but with the
// stand-in's own `latest` on it. It is how the test gets at the instance `ask` keeps to itself.
import { SuggestModal } from "../__mocks__/obsidian";

const D = (iso: string): Date => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y!, m! - 1, d);
};

const TODAY = D("2026-08-05");
const app = {} as never;

/** The instance `DateInputModal.ask` opened, with the two callbacks the app drives it by. */
function opened() {
  const modal = SuggestModal.latest;
  if (!modal) throw new Error("no modal was opened");
  return modal;
}

describe("DateInputModal", () => {
  beforeEach(() => {
    SuggestModal.latest = null;
  });

  /*
   * `SuggestModal.selectSuggestion` runs `this.close()` — which calls `onClose()` on the spot on
   * desktop — and only then `onChooseSuggestion`. A modal that resolves its promise from `onClose`
   * therefore answers "cancelled" a beat before it is told what was picked, and the date is lost
   * with no error anywhere: the field would look like a control that does nothing.
   */
  it("resolves with the date even though the app closes it before saying what was chosen", async () => {
    const asked = DateInputModal.ask(app, TODAY);
    const modal = opened();

    modal.onClose();
    modal.onChooseSuggestion({ label: "Demà", date: D("2026-08-06") } as never, {} as MouseEvent);

    await expect(asked).resolves.toEqual(D("2026-08-06"));
  });

  it("resolves with nothing when it is closed and nothing was chosen", async () => {
    const asked = DateInputModal.ask(app, TODAY);
    opened().onClose();

    await expect(asked).resolves.toBeNull();
  });

  it("reads the field through the parser, against the day it was opened on", () => {
    void DateInputModal.ask(app, TODAY);
    const suggestions = (opened() as unknown as DateInputModal).getSuggestions("dv");

    expect(suggestions.map((match) => match.label)).toEqual(["Divendres"]);
    expect(suggestions[0]!.date).toEqual(D("2026-08-07"));
  });
});
