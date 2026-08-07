/** Minimal stand-ins for the Obsidian runtime, enough to unit-test logic that imports it. */

export class Plugin {
  app: unknown = {};
  loadData() {
    return Promise.resolve({});
  }
  saveData() {
    return Promise.resolve();
  }
  addCommand() {}
  addRibbonIcon() {
    return createDiv();
  }
  addSettingTab() {}
  registerView() {}
  registerEvent() {}
}

export class PluginSettingTab {
  containerEl: unknown = { empty: () => {}, createEl: () => ({}) };
  constructor(_app: unknown, _plugin: unknown) {}
}

export class Setting {
  setName() {
    return this;
  }
  setDesc() {
    return this;
  }
  addText() {
    return this;
  }
  addTextArea() {
    return this;
  }
  addToggle() {
    return this;
  }
  addButton() {
    return this;
  }
}

export class ItemView {
  app: unknown = {};
  containerEl: unknown = { children: [null, stubEl()] };
  constructor(_leaf: unknown) {}
  addAction() {}
}

export class Modal {
  app: unknown = {};
  titleEl: unknown = stubEl();
  contentEl: unknown = stubEl();
  constructor(_app: unknown) {}
  open() {}
  close() {}
}

/**
 * Enough of `SuggestModal` to exercise a subclass's callbacks, and nothing that decides when they
 * fire — the app closes the modal *before* it says what was chosen, and that order is the thing
 * under test. `latest` is how a test reaches the instance `Modal.open()` would have shown.
 */
export class SuggestModal<T> extends Modal {
  static latest: {
    onClose(): void;
    onChooseSuggestion(item: never, event: MouseEvent | KeyboardEvent): void;
  } | null = null;

  limit = 0;
  emptyStateText = "";

  constructor(app: unknown) {
    super(app);
    SuggestModal.latest = this as unknown as (typeof SuggestModal)["latest"];
  }

  setPlaceholder(_placeholder: string) {}
  setInstructions(_instructions: unknown[]) {}
  getSuggestions(_query: string): T[] {
    return [];
  }
}

/** As the app has it: the fuzzy variant only forwards the chosen item to `onChooseItem`. */
export class FuzzySuggestModal<T> extends SuggestModal<{ item: T }> {
  onChooseSuggestion(match: { item: T }, event: MouseEvent | KeyboardEvent): void {
    this.onChooseItem(match.item, event);
  }
  onChooseItem(_item: T, _event: MouseEvent | KeyboardEvent): void {}
}

/**
 * Enough of the real `MenuItem` builder to exercise what a test cares about: which title got
 * which handler. `onClick`'s handler is kept, not run — the test decides when to fire it, the
 * same way `SuggestModal.latest` hands the test the modal instead of driving it itself.
 */
export class MenuItem {
  private title = "";
  private handler: (() => unknown) | null = null;

  setTitle(title: string) {
    this.title = title;
    return this;
  }
  setIcon(_icon: string) {
    return this;
  }
  setWarning(_warning: boolean) {
    return this;
  }
  setDisabled(_disabled: boolean) {
    return this;
  }
  onClick(handler: () => unknown) {
    this.handler = handler;
    return this;
  }
  getTitle(): string {
    return this.title;
  }
  /** Fires the handler a real click would, for a test driving the menu from the outside. */
  click(): unknown {
    return this.handler?.();
  }
}

/** `latest`, like `SuggestModal.latest`: the instance the code under test just built. */
export class Menu {
  static latest: Menu | null = null;
  items: MenuItem[] = [];

  constructor() {
    Menu.latest = this;
  }

  addItem(cb: (item: MenuItem) => unknown) {
    const item = new MenuItem();
    cb(item);
    this.items.push(item);
    return this;
  }
  addSeparator() {
    return this;
  }
  showAtMouseEvent() {}

  itemTitled(title: string): MenuItem {
    const found = this.items.find((item) => item.getTitle() === title);
    if (!found) throw new Error(`no menu item titled "${title}"`);
    return found;
  }
}

export class Notice {
  static latest: string | null = null;
  constructor(message: string) {
    Notice.latest = message;
  }
}

export class TFile {
  path = "";
  basename = "";
  extension = "md";
  stat = { mtime: 0, ctime: 0, size: 0 };
}

export class TFolder {
  path = "";
}

export const WorkspaceLeaf = class {};

export const MarkdownRenderer = { renderMarkdown: async () => {} };

export const setIcon = (_el: unknown, _icon: string) => {};

export const setTooltip = (_el: unknown, _text: string, _options?: unknown) => {};

export const normalizePath = (path: string) => path;

function stubEl(): unknown {
  const el: unknown = {
    empty: () => {},
    setText: () => {},
    addClass: () => {},
    removeClass: () => {},
    toggleClass: () => {},
    setAttribute: () => {},
    addEventListener: () => {},
    querySelector: () => null,
    querySelectorAll: () => [],
    createDiv: () => stubEl(),
    createSpan: () => stubEl(),
    createEl: () => stubEl(),
  };
  return el;
}
