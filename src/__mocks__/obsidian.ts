/** Minimal stand-ins for the Obsidian runtime, enough to unit-test logic that imports it. */

export class Plugin {
  app: any = {};
  loadData() {
    return Promise.resolve({});
  }
  saveData() {
    return Promise.resolve();
  }
  addCommand() {}
  addRibbonIcon() {
    return document.createElement("div");
  }
  addSettingTab() {}
  registerView() {}
  registerEvent() {}
}

export class PluginSettingTab {
  containerEl: any = { empty: () => {}, createEl: () => ({}) };
  constructor(_app: any, _plugin: any) {}
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
  app: any = {};
  containerEl: any = { children: [null, stubEl()] };
  constructor(_leaf: any) {}
  addAction() {}
}

export class Modal {
  app: any = {};
  titleEl: any = stubEl();
  contentEl: any = stubEl();
  constructor(_app: any) {}
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

function stubEl(): any {
  const el: any = {
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
