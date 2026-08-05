import { type App, Modal, Setting } from "obsidian";

/** Single-field prompt. Resolves with the trimmed value, or null if dismissed. */
export class PromptModal extends Modal {
  private value: string;
  private settled = false;

  constructor(
    app: App,
    private readonly title: string,
    initial: string,
    private readonly resolve: (value: string | null) => void
  ) {
    super(app);
    this.value = initial;
  }

  static ask(app: App, title: string, initial = ""): Promise<string | null> {
    return new Promise((resolve) => new PromptModal(app, title, initial, resolve).open());
  }

  onOpen(): void {
    this.titleEl.setText(this.title);

    new Setting(this.contentEl).addText((text) => {
      text.setValue(this.value).onChange((value) => {
        this.value = value;
      });
      text.inputEl.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          this.submit();
        }
      });
      window.setTimeout(() => text.inputEl.focus(), 0);
    });

    new Setting(this.contentEl)
      .addButton((button) => button.setButtonText("Cancel·lar").onClick(() => this.close()))
      .addButton((button) => button.setButtonText("Desar").setCta().onClick(() => this.submit()));
  }

  onClose(): void {
    if (!this.settled) {
      this.settled = true;
      this.resolve(null);
    }
  }

  private submit(): void {
    const trimmed = this.value.trim();
    if (trimmed.length === 0) return;
    this.settled = true;
    this.resolve(trimmed);
    this.close();
  }
}
