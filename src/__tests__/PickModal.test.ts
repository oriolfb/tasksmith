import { PickModal } from "../views/PickModal";
// See DateInputModal.test.ts: by path, so the stand-in's `latest` is on the class the plugin got.
import { SuggestModal } from "../__mocks__/obsidian";

const app = {} as never;

describe("PickModal", () => {
  beforeEach(() => {
    SuggestModal.latest = null;
  });

  /*
   * The same order that would have lost a typed date loses a picked project: `close()` runs
   * `onClose()` before `onChooseSuggestion` forwards the item to `onChooseItem`, so a promise
   * resolved from `onClose` says "cancelled" and `+ filtre` appears to do nothing at all.
   */
  it("resolves with the value even though the app closes it before saying what was picked", async () => {
    const asked = PickModal.ask(app, "Projecte", ["BI 2026", "Compres"]);
    const modal = SuggestModal.latest;
    if (!modal) throw new Error("no modal was opened");

    modal.onClose();
    modal.onChooseSuggestion({ item: "Compres" } as never, {} as MouseEvent);

    await expect(asked).resolves.toBe("Compres");
  });

  it("resolves with nothing when it is closed and nothing was picked", async () => {
    const asked = PickModal.ask(app, "Projecte", ["BI 2026"]);
    SuggestModal.latest?.onClose();

    await expect(asked).resolves.toBeNull();
  });
});
