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

export class Menu {
  addItem() {
    return this;
  }
  addSeparator() {
    return this;
  }
  showAtMouseEvent() {}
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
