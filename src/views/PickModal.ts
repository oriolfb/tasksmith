import { type App, FuzzySuggestModal } from "obsidian";

/**
 * Pick one value out of a list the vault produced — a project, an area, a person.
 *
 * A submenu would have been the obvious thing, but `MenuItem.setSubmenu` is not in the public
 * API, and this vault has more people than a submenu wants anyway. Obsidian's own fuzzy picker
 * is searchable, keyboard-first and looks native for free.
 */
export class PickModal extends FuzzySuggestModal<string> {
  private settled = false;

  private constructor(
    app: App,
    private readonly values: string[],
    placeholder: string,
    private readonly resolve: (value: string | null) => void
  ) {
    super(app);
    this.setPlaceholder(placeholder);
  }

  static ask(app: App, placeholder: string, values: string[]): Promise<string | null> {
    return new Promise((resolve) => new PickModal(app, values, placeholder, resolve).open());
  }

  getItems(): string[] {
    return this.values;
  }

  getItemText(value: string): string {
    return value;
  }

  onChooseItem(value: string): void {
    this.settled = true;
    this.resolve(value);
  }

  onClose(): void {
    if (!this.settled) this.resolve(null);
  }
}
