import { type App, Modal, Setting } from "obsidian";

/** Yes/no gate for destructive actions. Resolves false when dismissed. */
export class ConfirmModal extends Modal {
  private settled = false;

  constructor(
    app: App,
    private readonly title: string,
    private readonly body: string,
    private readonly confirmLabel: string,
    private readonly resolve: (confirmed: boolean) => void
  ) {
    super(app);
  }

  static ask(app: App, title: string, body: string, confirmLabel = "Eliminar"): Promise<boolean> {
    return new Promise((resolve) => new ConfirmModal(app, title, body, confirmLabel, resolve).open());
  }

  onOpen(): void {
    this.titleEl.setText(this.title);
    this.contentEl.createEl("p", { text: this.body });

    new Setting(this.contentEl)
      .addButton((button) => button.setButtonText("Cancel·lar").onClick(() => this.close()))
      .addButton((button) =>
        button
          .setButtonText(this.confirmLabel)
          .setWarning()
          .onClick(() => {
            this.settled = true;
            this.resolve(true);
            this.close();
          })
      );
  }

  onClose(): void {
    if (!this.settled) {
      this.settled = true;
      this.resolve(false);
    }
  }
}
