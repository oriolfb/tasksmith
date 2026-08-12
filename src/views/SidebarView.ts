import { ItemView, Notice, setIcon, setTooltip, type WorkspaceLeaf } from "obsidian";
import type { TaskIndex } from "../index/TaskIndex";
import type { TaskActions } from "../tasks/TaskActions";
import type { TaskSmithSettings } from "../settings/Config";
import type { Bucket, Task } from "../types/task";
import { ageInDays, bucketOf } from "../index/Buckets";
import { isEmptyTask } from "../index/EmptyTasks";
import { deserializeTaskCache } from "../index/TaskCache";
import { startOfToday } from "../index/dates";
import { NO_PERSON, type QueryState, peopleOf } from "../query/Query";
import { DAY_LIMIT, dayKey, focusSections, isUrgent } from "../query/Focus";
import { DaySelection } from "./DaySelection";
import { FocusRenderer, type Section } from "./FocusRenderer";
import { relativeLabel } from "./format";
import { t, tn } from "../i18n/strings";

export const SIDEBAR_VIEW = "task-smith-sidebar";

type Lens = "date" | "person";

/**
 * Rows shown per section before "N més".
 *
 * The dock is where you decide what to do next, not where you audit the backlog. Twenty-three
 * overdue rows there is pressure, not information — the whole list lives in the control centre.
 */
const SECTION_LIMIT = 5;

/** One run of text in the line above the list. */
interface SayPart {
  text: string;
  strong?: boolean;
  accent?: boolean;
}

/**
 * The focus view. One question — what will you do today — and everything else one keystroke
 * away. Two lenses over the same list: by date, or by who you need to talk to.
 */
export class SidebarView extends ItemView {
  private lens: Lens = "date";
  private search = "";
  private searchOpen = false;
  private renderer: FocusRenderer;
  private day: DaySelection;

  private listHost!: HTMLElement;
  private sayHost!: HTMLElement;
  private searchInput!: HTMLInputElement;
  private searchRow!: HTMLElement;
  private tabs = new Map<Lens, HTMLElement>();
  private totalEl!: HTMLElement;
  private unsubscribe: (() => void) | null = null;
  private queued = false;

  constructor(
    leaf: WorkspaceLeaf,
    private readonly index: TaskIndex,
    private readonly actions: TaskActions,
    private settings: TaskSmithSettings,
    private readonly openControlCentre: (filter?: Partial<QueryState>) => void,
    private readonly persist: () => Promise<void>
  ) {
    super(leaf);
    this.day = new DaySelection(this.settings.dayPlan, (plan) => {
      this.settings.dayPlan = plan;
      void this.persist();
    });
    this.renderer = new FocusRenderer(this.app, this.actions, {
      onToday: (task) => this.putInDay(task),
      onDate: (task, event) => this.renderer.dateMenu(task, event, () => this.refresh()),
      onComplete: (task, section) => void this.completeFrom(task, section.now === true),
      onReopen: (task) => void this.reopen(task),
      onDrop: (task) => this.drop(task),
      onReschedule: (task) => this.day.remove(task),
      onOpen: (task) => void this.renderer.openTask(task),
      onToggleSection: (key) => void this.toggleSection(key),
      isCollapsed: (key) => this.settings.collapsedSections.includes(key),
      onMore: (section) => this.openControlCentre(this.filterFor(section)),
    });
  }

  getViewType(): string {
    return SIDEBAR_VIEW;
  }

  getDisplayText(): string {
    return t("sidebar.title");
  }

  getIcon(): string {
    return "list-checks";
  }

  async onOpen(): Promise<void> {
    this.unsubscribe = this.index.onChange(() => this.scheduleRefresh());
    this.build();
    this.refresh();
  }

  async onClose(): Promise<void> {
    this.unsubscribe?.();
    this.unsubscribe = null;
  }

  setSettings(settings: TaskSmithSettings): void {
    this.settings = settings;
    this.refresh();
  }

  private build(): void {
    const root = this.containerEl.children[1] as HTMLElement;
    root.empty();
    root.addClass("tcf");

    const head = root.createDiv({ cls: "tcf-lens" });
    for (const [lens, label] of [
      ["date", t("lens.bucket")],
      ["person", t("lens.person")],
    ] as [Lens, string][]) {
      const tab = head.createEl("button", { cls: "tcf-tab", text: label });
      tab.addEventListener("click", () => this.setLens(lens));
      this.tabs.set(lens, tab);
    }

    const tools = head.createDiv({ cls: "tcf-lens-tools" });
    // `clickable-icon` is Obsidian's own icon style: no border, no background, muted colour.
    // Ours only adds the size, so it matches the icons in every other header in the app.
    const magnifier = tools.createDiv({ cls: "clickable-icon tcf-icon" });
    setIcon(magnifier, "search");
    magnifier.setAttribute("aria-label", t("search.label"));
    setTooltip(magnifier, t("search.tooltipWithKey"), { delay: 300 });
    magnifier.addEventListener("click", () => this.toggleSearch());

    const wide = tools.createDiv({ cls: "clickable-icon tcf-icon" });
    setIcon(wide, "layout-list");
    wide.setAttribute("aria-label", t("command.openControlCentre"));
    setTooltip(wide, t("controlCentre.title"), { delay: 300 });
    wide.addEventListener("click", () => this.openControlCentre());

    this.totalEl = head.createSpan({ cls: "tcf-total" });

    this.searchRow = root.createDiv({ cls: "tcf-search tcf-hidden" });
    this.searchInput = this.searchRow.createEl("input", { type: "search" });
    this.searchInput.placeholder = t("controlCentre.search");
    this.searchInput.addEventListener("input", () => {
      this.search = this.searchInput.value;
      this.refresh();
    });
    this.searchInput.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      this.searchInput.value = "";
      this.search = "";
      this.toggleSearch(false);
      this.refresh();
    });

    this.sayHost = root.createDiv({ cls: "tcf-say" });
    this.listHost = root.createDiv({ cls: "tcf-list" });
    this.listHost.addEventListener("keydown", (event) => this.onKey(event));

    const keys = root.createDiv({ cls: "tcf-keys" });
    for (const [key, what] of [
      ["J K", t("footer.key.move")],
      ["A", t("footer.key.today")],
      ["D", t("footer.key.date")],
      ["X", t("footer.key.done")],
      ["O", t("footer.key.open")],
      ["/", t("footer.key.search")],
    ]) {
      const hint = keys.createSpan();
      hint.createEl("b", { text: key });
      hint.appendText(` ${what}`);
    }
  }

  /**
   * What "Planificar el dia" does. Revealing the dock was not enough: with the dock already
   * open — which is most of the time — the button appeared to do nothing at all.
   *
   * So it puts the view in the state planning needs: the date lens, no search narrowing the
   * pool, "Avui" unfolded, the list at the top, and the keyboard already in it. The section
   * flashes once so the eye lands where the decision is.
   */
  beginPlanning(): void {
    if (!this.listHost) return;
    this.lens = "date";
    if (this.search) {
      this.search = "";
      this.searchInput.value = "";
    }
    this.toggleSearch(false);
    if (this.settings.collapsedSections.includes("avui")) {
      this.settings.collapsedSections = this.settings.collapsedSections.filter((key) => key !== "avui");
      void this.persist();
    }
    this.refresh();

    this.listHost.scrollTop = 0;
    const head = this.listHost.querySelector<HTMLElement>('.tcf-sec[data-tcf-key="avui"]');
    if (head) {
      head.addClass("tcf-flash");
      window.setTimeout(() => head.removeClass("tcf-flash"), 1200);
    }
    // The first row you could still act on: an empty slot means the choosing has not started.
    const first = this.listHost.querySelector<HTMLElement>(".tcf-row:not(.tcf-done)");
    first?.focus();
  }

  private setLens(lens: Lens): void {
    if (this.lens === lens) return;
    this.lens = lens;
    this.refresh();
  }

  private toggleSearch(open = !this.searchOpen): void {
    this.searchOpen = open;
    this.searchRow.toggleClass("tcf-hidden", !open);
    if (open) this.searchInput.focus();
  }

  refresh(): void {
    if (!this.listHost) return;
    if (!this.index.ready) {
      const cached = deserializeTaskCache(this.settings.taskCache);
      if (!cached) {
        this.paintLoading();
        return;
      }
      // Painted from the last full scan until the real one lands. `prune` stays off here: it
      // persists what it reconciles, and reconciling against a stale snapshot could drop a pick
      // the live scan — moments away — would actually have kept. Reading a stale row is fine;
      // it's a fresh write to a cache-only decision that would not undo itself.
      this.paintFrom(cached, false);
      return;
    }
    this.paintFrom(this.index.all(), true);
  }

  private paintFrom(all: Task[], pruneAgainstLive: boolean): void {
    const today = startOfToday();

    this.day.refresh(today);
    // Only once the index has actually been read. Reconciling the plan against a scan still in
    // flight is how a day's three chosen tasks disappeared between one Obsidian session and the next.
    if (pruneAgainstLive) this.day.prune(all, today);

    const sections = this.lens === "date" ? this.dateSections(all, today) : this.personSections(all, today);
    // The colour says which lens is active; `aria-pressed` says it out loud for a screen reader.
    for (const [lens, tab] of this.tabs) {
      const on = lens === this.lens;
      tab.toggleClass("tcf-tab-on", on);
      tab.setAttribute("aria-pressed", String(on));
    }

    // Once the three slots are full, the rest of the list steps back: the day is decided, and
    // the pool is there for reference rather than for more deciding. It brightens on hover.
    this.listHost.toggleClass("tcf-committed", this.lens === "date" && this.day.isFull);

    this.renderer.render(this.listHost, sections, today);
  }

  /**
   * Placeholder rows in the shape real ones take, so the list does not jump from a lone
   * "loading" line into rows once the scan finishes.
   */
  private paintLoading(): void {
    this.listHost.empty();
    const wrap = this.listHost.createDiv({ attr: { "aria-busy": "true", "aria-label": t("row.loading") } });
    for (const width of [70, 45, 85]) {
      const row = wrap.createDiv({ cls: "tcf-skel-row" });
      row.createDiv({ cls: "tcf-skel-box" });
      const text = row.createDiv({ cls: "tcf-skel-text" });
      text.style.maxWidth = `${width}%`;
    }
  }

  private dateSections(all: Task[], today: Date): Section[] {
    const focus = focusSections({
      tasks: all,
      chosen: this.day.keys(),
      done: this.day.doneKeys(),
      slotted: this.day.slottedKeys(),
      today,
      text: this.search,
    });

    // Ordinals come from `slotted` pick order, not from `chosen`'s current position, so a task's
    // number holds even after it is finished and its slot reopens for another pick.
    const ordinals = focus.ordinals;
    // What "the day's three" means for the header and the empty slots below: every pick that
    // counts against `DAY_LIMIT`, whether it is still open or already finished. A task finishing
    // does not shrink this back down — that would be the slot's number reopening for reuse.
    const settled = focus.chosen.length + focus.doneChosen.length;
    const finishedToday = focus.doneChosen.length + focus.done.length;
    // Still ordered by ordinal, so a finished pick renders exactly where it always did among the
    // still-open ones instead of jumping to the foot with the tasks that arrived on their own.
    const chosenAndFinished = [...focus.chosen, ...focus.doneChosen].sort(
      (a, b) => (ordinals.get(dayKey(a)) ?? 0) - (ordinals.get(dayKey(b)) ?? 0)
    );

    this.totalEl.setText(t("sidebar.openCount", { count: this.openCount(all) }));

    const said: SayPart[] = [];
    if (focus.urgent.length > 0) {
      said.push(
        { text: tn("sidebar.arrivedAlone", focus.urgent.length), strong: true },
        { text: t("sidebar.tries") },
        { text: t("sidebar.fraction", { settled, limit: DAY_LIMIT }), accent: true },
        { text: t("sidebar.remainingToRenegotiate", { count: focus.renegotiate.length }) }
      );
    } else if (settled > 0) {
      said.push(
        { text: t("sidebar.tries") },
        { text: t("sidebar.fraction", { settled, limit: DAY_LIMIT }), accent: true },
        { text: t("sidebar.forToday", { count: focus.renegotiate.length }) }
      );
    } else {
      said.push(
        { text: t("sidebar.whatToday"), strong: true },
        {
          text: t("sidebar.pickN", {
            limit: DAY_LIMIT,
            renegotiate: focus.renegotiate.length,
            undated: focus.undated.length,
          }),
        }
      );
    }
    // Said last and said plainly: the line that answers "he fet res, avui?".
    if (finishedToday > 0) said.push({ text: tn("sidebar.doneSoFar", finishedToday), strong: true });
    this.say(...said);

    /*
     * "Tria la segona… i la tercera" is onboarding for a day that has not started. Once you have
     * closed or picked your way to three, the goal is met — a finished task freeing its slot back
     * up (see `DaySelection`) should not read as the app asking for two more. From then on, adding
     * past three is your call alone, offered once, quietly, with no ordinal walking you through it.
     */
    const goalMet = settled >= DAY_LIMIT;
    const emptySlots: number[] = [];
    if (!goalMet) {
      for (let slot = settled + 1; slot <= DAY_LIMIT; slot++) emptySlots.push(slot);
    }

    return [
      {
        key: "avui",
        label: t("sidebar.section.today"),
        // No count: "2 han arribat soles · 1 de 3 triada" already says it, and a bare number
        // next to it only invites the question of which one it is counting.
        why: whyToday(focus.urgent.length, settled, finishedToday),
        // Urgent tasks jump the queue while you are still choosing, so nothing genuinely urgent
        // sits unseen while you deliberate. Once the day is full, that ordering would bury the
        // three you already committed to under one you never picked — so chosen goes first.
        tasks: goalMet ? [...chosenAndFinished, ...focus.urgent] : [...focus.urgent, ...chosenAndFinished],
        done: focus.done,
        now: true,
        emptySlots,
        optionalSlot: goalMet && focus.chosen.length < DAY_LIMIT,
        ordinals,
        urgent: focus.urgent.length > 0,
      },
      {
        key: "renegociar",
        label: t("sidebar.section.renegotiate"),
        why: t("sidebar.section.renegotiateWhy"),
        count: focus.renegotiate.length,
        tasks: focus.renegotiate,
        limit: SECTION_LIMIT,
      },
      {
        key: "sense-data",
        label: t("sidebar.section.undated"),
        count: focus.undated.length,
        tasks: focus.undated,
        limit: SECTION_LIMIT,
      },
      {
        key: "mes-endavant",
        label: t("sidebar.section.later"),
        count: focus.later.length,
        tasks: focus.later,
        limit: SECTION_LIMIT,
      },
    ];
  }

  /**
   * Same tasks, grouped by who you need them with. A task in a note naming two people appears
   * under both, which is why the numbers here add up to more than the task count.
   */
  private personSections(all: Task[], today: Date): Section[] {
    const focus = focusSections({ tasks: all, chosen: [], today, text: this.search });
    const open = [...focus.urgent, ...focus.renegotiate, ...focus.undated, ...focus.later];

    const byPerson = new Map<string, Task[]>();
    for (const task of open) {
      for (const person of peopleOf(task)) {
        const list = byPerson.get(person);
        if (list) list.push(task);
        else byPerson.set(person, [task]);
      }
    }

    const sections = [...byPerson.entries()]
      .sort((a, b) => {
        if ((a[0] === NO_PERSON) !== (b[0] === NO_PERSON)) return a[0] === NO_PERSON ? 1 : -1;
        return b[1].length - a[1].length || a[0].localeCompare(b[0]);
      })
      .map(([person, tasks]): Section => {
        const late = tasks.filter((task) => bucketOf(task, today) === "overdue");
        const oldest = late
          .map((task) => ageInDays(task, null, today) ?? 0)
          .reduce((worst, age) => Math.max(worst, age), 0);
        return {
          key: `person:${person}`,
          label: person,
          why:
            late.length > 0
              ? tn("sidebar.lateWhy", late.length, { age: relativeLabel(addDaysBack(today, oldest), today) })
              : undefined,
          count: tasks.length,
          tasks: [...tasks].sort((a, b) => byLateness(a, b, today)),
          limit: SECTION_LIMIT,
          prominent: true,
        };
      });

    const people = sections.filter((section) => section.key !== `person:${NO_PERSON}`).length;
    const withPerson = open.filter((task) => task.people.length > 0).length;
    this.totalEl.setText(t("sidebar.openCount", { count: this.openCount(all) }));
    if (people === 0) {
      this.say({ text: t("sidebar.noPeople.part1") }, { text: t("sidebar.noPeople.label"), strong: true }, {
        text: t("sidebar.noPeople.part2"),
      });
    } else {
      this.say(
        { text: tn("sidebar.conversations", people), strong: true },
        { text: tn("sidebar.closesTasks", people, { tasks: tn("sidebar.tasksCount", withPerson) }) }
      );
    }
    return sections;
  }

  /** The wide view's equivalent filter for a dock section, so "N més" lands on the same tasks. */
  private filterFor(section: Section): Partial<QueryState> {
    if (section.key.startsWith("person:")) {
      return { group: "person", person: section.key.slice("person:".length), statusScope: "open" };
    }
    const buckets: Partial<Record<string, Bucket[]>> = {
      renegociar: ["overdue"],
      "sense-data": ["undated"],
      "mes-endavant": ["week", "nextWeek", "month", "later"],
    };
    const wanted = buckets[section.key];
    return wanted ? { group: "bucket", buckets: wanted, statusScope: "open" } : {};
  }

  private openCount(all: Task[]): number {
    return all.filter((task) => task.open && !isEmptyTask(task) && task.kind === "commitment").length;
  }

  /** Built as DOM rather than a string: no note content ever reaches an `innerHTML`. */
  private say(...parts: SayPart[]): void {
    this.sayHost.empty();
    for (const part of parts) {
      if (part.strong) this.sayHost.createEl("b", { text: part.text });
      else if (part.accent) this.sayHost.createSpan({ cls: "tcf-l", text: part.text });
      else this.sayHost.appendText(part.text);
    }
  }

  private putInDay(task: Task): void {
    if (this.day.has(task)) {
      this.day.remove(task);
      this.refresh();
      return;
    }
    if (!this.day.add(task)) {
      new Notice(t("notice.dayLimitReached", { limit: DAY_LIMIT }));
      return;
    }
    this.refresh();
  }

  /**
   * Ticking a row off. In "Avui" the line stays where it is, struck through, and its slot opens up
   * for another one — the day should read as a day you worked, not as a list that emptied itself.
   * Elsewhere the row simply goes: the pool is a pool, and the record belongs to the day's plan.
   */
  private async completeFrom(task: Task, inToday: boolean): Promise<void> {
    const result = await this.actions.complete(task);
    if (result?.ok && inToday) this.day.markDone(task);
    this.refresh();
  }

  /** Whether a row sits in "Avui": you chose it, or it arrived on its own. */
  private inToday(task: Task): boolean {
    return this.lens === "date" && (this.day.has(task) || isUrgent(task, startOfToday()));
  }

  /** Un-ticking one, from the check itself. It goes back to the day when a slot is free. */
  private async reopen(task: Task): Promise<void> {
    const result = await this.actions.reopen(task);
    if (result.ok) this.day.reopened(task);
    this.refresh();
  }

  /** "No ho faré": cancels the line, which the Tasks plugin reads as a cancelled task. */
  private async drop(task: Task): Promise<void> {
    this.day.remove(task);
    await this.actions.cancel(task);
    this.refresh();
  }

  private async toggleSection(key: string): Promise<void> {
    const collapsed = this.settings.collapsedSections;
    this.settings.collapsedSections = collapsed.includes(key)
      ? collapsed.filter((k) => k !== key)
      : [...collapsed, key];
    this.refresh();
    await this.persist();
  }

  /** Rows are focusable, so the whole cycle works without the mouse. */
  private onKey(event: KeyboardEvent): void {
    // Finished rows are a record, not a queue: J/K walks past them.
    const rows = Array.from(this.listHost.querySelectorAll<HTMLElement>(".tcf-row:not(.tcf-done)"));
    if (rows.length === 0) return;
    const current = rows.indexOf(document.activeElement as HTMLElement);

    const move = (delta: number): void => {
      const next = rows[Math.max(0, Math.min(rows.length - 1, current + delta))];
      next?.focus();
      event.preventDefault();
    };

    switch (event.key) {
      case "j":
      case "ArrowDown":
        return move(current < 0 ? 0 : 1);
      case "k":
      case "ArrowUp":
        return move(current < 0 ? 0 : -1);
      case "/":
        this.toggleSearch(true);
        event.preventDefault();
        return;
    }

    if (current < 0) return;
    const task = this.taskAt(rows[current]!);
    if (!task) return;

    switch (event.key) {
      case "a":
        this.putInDay(task);
        break;
      case "d":
        // Discarding lives inside this menu, on purpose: there is no bare key for it.
        rows[current]!.querySelector<HTMLElement>('[data-act="date"]')?.click();
        break;
      case "x":
      case "Enter":
        void this.completeFrom(task, this.inToday(task));
        break;
      case "o":
        void this.renderer.openTask(task);
        break;
      default:
        return;
    }
    event.preventDefault();
  }

  private taskAt(row: HTMLElement): Task | null {
    const key = row.dataset.tcfKey;
    if (!key) return null;
    const split = key.lastIndexOf(":");
    const path = key.slice(0, split);
    const line = Number(key.slice(split + 1));
    return this.index.all().find((t) => t.location.path === path && t.location.line === line) ?? null;
  }

  /** Coalesces the burst of change events a single file save produces. */
  private scheduleRefresh(): void {
    if (this.queued) return;
    this.queued = true;
    window.setTimeout(() => {
      this.queued = false;
      this.refresh();
    }, 80);
  }
}

function whyToday(urgent: number, chosen: number, done: number): string {
  const parts: string[] = [];
  if (urgent > 0) parts.push(tn("sidebar.arrived", urgent));
  parts.push(tn("sidebar.chosenCount", chosen, { limit: DAY_LIMIT }));
  if (done > 0) parts.push(tn("sidebar.doneCount", done));
  return parts.join(" · ");
}

function byLateness(a: Task, b: Task, today: Date): number {
  const late = (task: Task): number =>
    bucketOf(task, today) === "overdue" ? (ageInDays(task, null, today) ?? 0) : -1;
  return late(b) - late(a);
}

function addDaysBack(today: Date, days: number): Date {
  return new Date(today.getFullYear(), today.getMonth(), today.getDate() - days);
}
