import { type App, Menu, Notice, TFile, setIcon, setTooltip } from "obsidian";
import type { Task } from "../types/task";
import type { TaskActions } from "../tasks/TaskActions";
import { ageInDays, bucketOf } from "../index/Buckets";
import { dayKey } from "../query/Focus";
import { addDays, startOfToday } from "../index/dates";
import { noteName, relativeLabel, shortDate } from "./format";

export interface Section {
  key: string;
  label: string;
  /** Small print next to the label: the reason this section exists. */
  why?: string;
  /** Right-hand number. Omitted for sections whose count is already in `why`. */
  count?: number;
  tasks: Task[];
  /** Renders the label in lila: this is the section that matters right now. */
  now?: boolean;
  /**
   * Ordinals of the still-free slots, e.g. `[2, 3]`. Independent of how many tasks the section
   * holds, because urgent tasks arrive on their own and never occupy one of your three.
   */
  emptySlots?: number[];
  /** Ordinal shown instead of a checkbox, for the tasks you chose. */
  ordinals?: Map<string, number>;
  /** Terracotta rule: these arrived on their own. */
  urgent?: boolean;
  /** A heading with real weight, used for people. */
  prominent?: boolean;
  /**
   * How many rows to show before a quiet "N more" link.
   *
   * Twenty-three overdue rows in a 330px dock is not information, it is pressure. The focus
   * view shows the head of each list; the whole list is one click away in the control centre.
   */
  limit?: number;
}

const SLOT_HINTS: Record<number, string> = {
  1: "tria la primera…",
  2: "tria la segona…",
  3: "i la tercera",
};

export interface RowCallbacks {
  onToday: (task: Task) => void;
  onDate: (task: Task, event: MouseEvent) => void;
  /** Async so the menu can wait for the write before refreshing. */
  onDrop: (task: Task) => Promise<void>;
  onOpen: (task: Task) => void;
  onToggleSection: (key: string) => void;
  isCollapsed: (key: string) => boolean;
  /** "18 més" — hands the rest over to the wide view. */
  onMore: () => void;
}

/**
 * The dense list. No cards, no borders, no avatars: text hierarchy plus one hairline, and a
 * background only on hover. Three accents, each with one job — lila for what you chose,
 * terracotta for what arrived on its own, ochre for age (as text, never as a badge).
 */
export class FocusRenderer {
  constructor(
    private readonly app: App,
    private readonly actions: TaskActions,
    private readonly callbacks: RowCallbacks
  ) {}

  render(host: HTMLElement, sections: Section[], today: Date): void {
    const previous = this.positions(host);
    host.empty();

    const anything = sections.some((section) => section.tasks.length > 0 || section.emptySlots?.length);
    if (!anything) {
      host.createDiv({ cls: "tcf-empty", text: "Res per aquí. Cap tasca compleix el filtre." });
      return;
    }

    for (const section of sections) {
      if (section.tasks.length === 0 && !section.emptySlots?.length) continue;
      this.renderSection(host, section, today);
    }

    this.animateFrom(previous, host);
  }

  private renderSection(host: HTMLElement, section: Section, today: Date): void {
    const collapsed = this.callbacks.isCollapsed(section.key);

    // A div, not a <button>: Obsidian's own button styling (background, radius, padding) wins
    // over ours in several themes, and a filled grey box is not what a section label is.
    // role + tabindex + Enter/Space keep it exactly as accessible as the button was.
    const head = host.createDiv({ cls: "tcf-sec" });
    if (section.now) head.addClass("tcf-sec-now");
    // A person is a heading, not a filing label: it gets real size and real space.
    if (section.prominent) head.addClass("tcf-sec-big");
    // Everything that is not today dims once the three slots are full.
    if (!section.now) head.addClass("tcf-secondary");
    head.setAttribute("role", "button");
    head.tabIndex = 0;
    head.setAttribute("aria-expanded", String(!collapsed));
    head.dataset.tcfKey = section.key;
    head.createSpan({ cls: "tcf-sec-name", text: section.label });
    if (section.why) head.createSpan({ cls: "tcf-sec-why", text: section.why });
    if (section.count !== undefined) {
      head.createSpan({ cls: "tcf-sec-count", text: String(section.count) });
    }
    const toggle = (): void => this.callbacks.onToggleSection(section.key);
    head.addEventListener("click", toggle);
    head.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      toggle();
    });

    if (collapsed) return;

    const limit = section.limit ?? section.tasks.length;
    for (const task of section.tasks.slice(0, limit)) this.renderRow(host, task, section, today);

    const hidden = section.tasks.length - limit;
    if (hidden > 0) {
      const more = host.createDiv({ cls: "tcf-more" });
      more.setAttribute("role", "button");
      more.tabIndex = 0;
      more.setText(`${hidden} més`);
      more.addEventListener("click", () => this.callbacks.onMore());
    }

    for (const slot of section.emptySlots ?? []) {
      const empty = host.createDiv({ cls: "tcf-slot" });
      empty.createSpan({ cls: "tcf-lead tcf-ord tcf-ord-empty", text: String(slot) });
      empty.createSpan({ text: SLOT_HINTS[slot] ?? "tria'n una més…" });
    }
  }

  private renderRow(host: HTMLElement, task: Task, section: Section, today: Date): void {
    const row = host.createDiv({ cls: "tcf-row" });
    row.dataset.tcfKey = `${task.location.path}:${task.location.line}`;
    row.tabIndex = 0;
    if (section.urgent) row.addClass("tcf-urgent");
    if (!section.now) row.addClass("tcf-secondary");

    /*
     * The ordinal goes *next to* the checkbox, never instead of it. Replacing the box with the
     * number left the three tasks you committed to as the only ones in the view you could not
     * tick off — the exact opposite of what the section is for.
     */
    const ordinal = section.ordinals?.get(dayKey(task));
    if (ordinal !== undefined) row.createSpan({ cls: "tcf-ord", text: String(ordinal) });

    const box = row.createDiv({ cls: "tcf-lead tcf-mark" });
    box.setAttribute("role", "button");
    box.setAttribute("aria-label", "Completar");
    setTooltip(box, "Completar", { delay: 200 });
    box.addEventListener("click", (event) => {
      event.stopPropagation();
      void this.actions.complete(task);
    });

    const main = row.createDiv({ cls: "tcf-main" });
    const text = main.createDiv({ cls: "tcf-text", text: task.description || "(sense descripció)" });
    text.addEventListener("click", () => this.callbacks.onOpen(task));

    /*
     * The second line carries the context on the left and the actions on the right.
     *
     * They used to sit in a third column of the row, which left the description about 190px in a
     * 330px dock — every task broke into three or four lines. Down here the text gets the full
     * width and the actions use space that was empty anyway.
     */
    const footer = main.createDiv({ cls: "tcf-foot" });
    footer.createSpan({ cls: "tcf-meta" }, (meta) => this.renderMeta(meta, task, section, today));

    /*
     * Two words, not three. "No" used to sit here next to them, one careless click away from
     * cancelling a task — recoverable, but you would have to go looking for it. It now lives at
     * the bottom of the date menu, which costs one deliberate step more.
     */
    const tools = footer.createDiv({ cls: "tcf-do" });
    this.action(tools, "today", "Avui", "Posar-la al dia d'avui", () => this.callbacks.onToday(task));
    this.action(tools, "date", "Data", "Data, o descartar-la", (event) => this.callbacks.onDate(task, event));
  }

  /**
   * The date, the age and the context — as text, in one line, never breaking inside itself.
   * "data d'avui" replaces the age rather than joining it: a task due today is not also late.
   */
  private renderMeta(meta: HTMLElement, task: Task, section: Section, today: Date): void {
    const bucket = bucketOf(task, today);

    if (section.urgent && bucket === "today") {
      meta.createSpan({ cls: "tcf-now", text: "data d'avui" });
    } else if (section.urgent) {
      meta.createSpan({ cls: "tcf-now", text: "marcada com a urgent" });
    } else if (bucket === "overdue") {
      meta.createSpan({ cls: "tcf-late", text: relativeLabel(task.effectiveDate, today) });
    } else if (bucket === "undated") {
      const age = ageInDays(task, null, today);
      meta.createSpan({
        text: age !== null && age > 0 ? `apuntada ${relativeLabel(addDays(today, -age), today)}` : "sense data",
      });
    } else {
      meta.createSpan({ text: relativeLabel(task.effectiveDate, today) });
    }

    /*
     * One piece of context, not three. The person if the note names one, otherwise where it
     * came from. Everything else — the other people, the full path, the exact date — is in the
     * tooltip. Four fragments per row across twenty rows is what made the list feel like
     * pressure rather than a list.
     */
    const origin = task.noteTitle ?? noteName(task.location.path);
    const label = task.people[0] ?? origin;
    const extra = task.people.length > 1 ? ` +${task.people.length - 1}` : "";

    meta.createSpan({ cls: "tcf-dot", text: "·" });
    const source = meta.createSpan({
      cls: task.people.length > 0 ? "tcf-who" : "tcf-src",
      text: `${label}${extra}`,
    });
    setTooltip(source, this.contextTooltip(task, origin), { delay: 200 });
    source.addEventListener("click", () => this.callbacks.onOpen(task));
  }

  private contextTooltip(task: Task, origin: string): string {
    const lines = [origin, task.location.path];
    if (task.people.length > 0) lines.unshift(task.people.join(", "));
    const date = dateNote(task);
    if (date) lines.push(date.replace(/^ · /, ""));
    return lines.join("\n");
  }

  /**
   * The actions are words, so they are spans rather than buttons — a `<button>` picks up the
   * theme's padding, background and radius, and three grey pills weigh more than the row itself.
   * Not in the tab order on purpose: the row is focusable and `A`/`D`/`N` do the same thing.
   */
  private action(
    host: HTMLElement,
    act: string,
    label: string,
    tooltip: string,
    run: (event: MouseEvent) => void,
    cls = ""
  ): void {
    const word = host.createSpan({ cls: `tcf-act ${cls}`.trim(), text: label });
    word.dataset.act = act;
    word.setAttribute("role", "button");
    word.setAttribute("aria-label", tooltip);
    setTooltip(word, tooltip, { delay: 300 });
    word.addEventListener("click", (event) => {
      event.stopPropagation();
      run(event);
    });
  }

  /** Reads where every row is now, so the next paint can animate from here. */
  private positions(host: HTMLElement): Map<string, DOMRect> {
    const map = new Map<string, DOMRect>();
    for (const el of Array.from(host.querySelectorAll<HTMLElement>("[data-tcf-key]"))) {
      const key = el.dataset.tcfKey;
      if (key) map.set(key, el.getBoundingClientRect());
    }
    return map;
  }

  /**
   * FLIP over real geometry: measure, rebuild, invert, play. Real geometry rather than assumed
   * row heights, because a task's text wraps to two or three lines in a 300px dock.
   */
  private animateFrom(previous: Map<string, DOMRect>, host: HTMLElement): void {
    if (previous.size === 0) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let index = 0;
    for (const el of Array.from(host.querySelectorAll<HTMLElement>("[data-tcf-key]"))) {
      const key = el.dataset.tcfKey;
      const before = key ? previous.get(key) : undefined;
      const after = el.getBoundingClientRect();
      if (!after.height) continue;

      if (!before) {
        el.animate(
          [
            { opacity: 0, transform: "translateY(-4px)" },
            { opacity: 1, transform: "none" },
          ],
          { duration: 240, easing: "ease-out", delay: index++ * 12 }
        );
        continue;
      }
      const dy = before.top - after.top;
      const dx = before.left - after.left;
      if (!dx && !dy) continue;
      el.animate(
        [{ transform: `translate(${dx}px,${dy}px)` }, { transform: "none" }],
        { duration: 420, easing: "cubic-bezier(.22,.9,.24,1)", delay: index++ * 12 }
      );
    }
  }

  /** The date menu: what the plugin can already write, without a new parser. */
  dateMenu(task: Task, event: MouseEvent, onDone: () => void): void {
    const menu = new Menu();
    const today = startOfToday();

    const entry = (title: string, run: () => Promise<unknown>): void => {
      menu.addItem((item) =>
        item.setTitle(title).onClick(async () => {
          await run();
          onDone();
        })
      );
    };

    entry("Demà", () => this.actions.tomorrow(task));
    entry("Divendres", () => this.actions.scheduleOn(task, nextFriday(today)));
    entry("Dilluns que ve", () => this.actions.scheduleOn(task, nextMonday(today)));
    entry("+1 setmana", () => this.actions.nextWeek(task));
    entry("+1 mes", () => this.actions.postpone(task, 30));
    menu.addSeparator();
    entry("Treure la data", () => this.actions.clearDue(task));
    menu.addSeparator();
    menu.addItem((item) =>
      item
        .setTitle("Obrir la nota")
        .setIcon("file-text")
        .onClick(() => this.callbacks.onOpen(task))
    );
    // Last, separated, and marked as a warning: discarding should take one deliberate step more
    // than postponing. It is still undoable — but you should not reach it by accident.
    menu.addSeparator();
    menu.addItem((item) =>
      item
        .setTitle("No ho faré")
        .setIcon("x")
        .setWarning(true)
        .onClick(async () => {
          await this.callbacks.onDrop(task);
          onDone();
        })
    );
    menu.showAtMouseEvent(event);
  }

  async openTask(task: Task): Promise<void> {
    const file = this.app.vault.getAbstractFileByPath(task.location.path);
    if (!(file instanceof TFile)) {
      new Notice(`No trobo ${task.location.path}`);
      return;
    }
    const leaf = this.app.workspace.getLeaf(false);
    await leaf.openFile(file, { eState: { line: task.location.line } });
  }
}

function dateNote(task: Task): string {
  if (!task.effectiveDate) return "";
  const own = task.fields.due?.date ?? task.fields.scheduled?.date ?? task.fields.start?.date;
  return own
    ? ` · ${shortDate(task.effectiveDate)}`
    : ` · ${shortDate(task.effectiveDate)}, heretada de la nota`;
}

export function nextFriday(today: Date): Date {
  const delta = (5 - today.getDay() + 7) % 7;
  return addDays(today, delta === 0 ? 7 : delta);
}

export function nextMonday(today: Date): Date {
  const delta = (8 - today.getDay()) % 7;
  return addDays(today, delta === 0 ? 7 : delta);
}
