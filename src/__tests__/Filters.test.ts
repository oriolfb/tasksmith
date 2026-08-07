import { bucketsLabel, describeFilters, filterMenu, type ChipContext } from "../query/Filters";
import { DEFAULT_QUERY, NO_PROJECT, type QueryState } from "../query/Query";

const ctx: ChipContext = { staleThresholdDays: 14, referenceLines: 3, somedayLines: 0 };

function labels(query: Partial<QueryState>, chipCtx: ChipContext = ctx): string[] {
  return describeFilters({ ...DEFAULT_QUERY, ...query }, chipCtx).map((chip) => chip.label);
}

describe("describeFilters", () => {
  it("reads the resting state as a sentence, implicit filters included", () => {
    expect(labels({})).toEqual(["obertes", "és una tasca (no documentació)"]);
  });

  it("says nothing about documentation in a vault that has none", () => {
    expect(labels({}, { ...ctx, referenceLines: 0 })).toEqual(["obertes"]);
  });

  it("names the deadline filter the way the dock's sections do", () => {
    expect(labels({ buckets: ["overdue"] })).toContain("per renegociar");
    expect(labels({ buckets: ["undated"] })).toContain("sense data");
    // The dock's "N més" hands over all four at once, and it is one idea, so it gets one chip.
    expect(labels({ buckets: ["week", "nextWeek", "month", "later"] })).toContain("més endavant");
  });

  /** A week that starts tomorrow is not a week. */
  it("calls «aquesta setmana» the set that includes today", () => {
    expect(bucketsLabel(["today", "week"])).toBe("aquesta setmana");
    expect(bucketsLabel(["week"])).toBe("d'aquí a diumenge");
  });

  it("joins a combination it has no name for", () => {
    expect(bucketsLabel(["today", "undated"])).toBe("amb data d'avui o sense data");
  });

  /** The chip the week strip leaves behind, so a table filtered to Thursday says so. */
  it("names the day filter, with today and tomorrow by name", () => {
    const today = new Date(2026, 7, 5);
    expect(labels({ dueOn: ["2026-08-05"] }, { ...ctx, today })).toContain("amb data avui");
    expect(labels({ dueOn: ["2026-08-06"] }, { ...ctx, today })).toContain("amb data demà");
    expect(labels({ dueOn: ["2026-08-07"] }, { ...ctx, today })).toContain("amb data dv. 7 ag");
  });

  /** A Monday carrying its hidden weekend is a run of days, and says so as a run. */
  it("names several days as a span rather than listing them", () => {
    const today = new Date(2026, 7, 5);
    expect(labels({ dueOn: ["2026-08-08", "2026-08-09", "2026-08-10"] }, { ...ctx, today })).toContain(
      "amb data del ds. 8 ag al dl. 10 ag"
    );
    expect(labels({ dueOn: ["2026-08-07", "2026-08-11"] }, { ...ctx, today })).toContain(
      "amb data dv. 7 ag o dt. 11 ag"
    );
  });

  it("shows the search text as its own chip", () => {
    expect(labels({ text: "  drive  " })).toContain("«drive»");
  });

  it("distinguishes a named project from the missing one", () => {
    expect(labels({ project: "Algolia" })).toContain("projecte: Algolia");
    expect(labels({ project: NO_PROJECT })).toContain("sense projecte");
  });

  it("clears each chip back to the widest sensible state", () => {
    const chips = describeFilters(
      { ...DEFAULT_QUERY, buckets: ["overdue"], person: "Carmen", staleOnly: true },
      ctx
    );
    const clear = Object.fromEntries(chips.map((chip) => [chip.key, chip.clear]));
    expect(clear.status).toEqual({ statusScope: "all" });
    expect(clear.buckets).toEqual({ buckets: null });
    expect(clear.person).toEqual({ person: null });
    expect(clear.stale).toEqual({ staleOnly: false });
    // The exclusion chips do not clear to "nothing", they clear to "show them too".
    expect(clear.reference).toEqual({ includeReference: true });
  });

  it("turns around once the documentation is being shown", () => {
    expect(labels({ includeReference: true })).toContain("amb documentació");
  });

  it("carries the stale threshold in the label, because 14 is a setting", () => {
    expect(labels({ staleOnly: true }, { ...ctx, staleThresholdDays: 30 })).toContain(
      "aturades fa més de 30 dies"
    );
  });
});

describe("filterMenu", () => {
  it("ticks what is already on, and reads as menu entries rather than chips", () => {
    const groups = filterMenu({ ...DEFAULT_QUERY, buckets: ["overdue"] }, ctx);
    const deadline = groups.find((group) => group.label === "Termini")!;
    expect(deadline.options.find((option) => option.checked)?.label).toBe("Per renegociar");

    const status = groups.find((group) => group.label === "Estat")!;
    expect(status.options.find((option) => option.checked)?.label).toBe("Obertes");
  });

  it("offers a week that includes today, not one that starts tomorrow", () => {
    const deadline = filterMenu(DEFAULT_QUERY, ctx).find((group) => group.label === "Termini")!;
    const week = deadline.options.find((option) => option.label === "Aquesta setmana");
    // The day filter comes off with it: a bucket and a single day answer the same question.
    expect(week?.patch).toEqual({ buckets: ["today", "week"], dueOn: null });
  });

  it("offers the line kinds only when the vault holds such lines", () => {
    expect(filterMenu(DEFAULT_QUERY, ctx).some((group) => group.label === "Línies")).toBe(true);
    expect(
      filterMenu(DEFAULT_QUERY, { ...ctx, referenceLines: 0 }).some((group) => group.label === "Línies")
    ).toBe(false);
  });

  it("makes the line toggles toggle rather than always turning on", () => {
    const on = filterMenu({ ...DEFAULT_QUERY, includeReference: true }, ctx);
    const option = on.find((group) => group.label === "Línies")!.options[0]!;
    expect(option.patch).toEqual({ includeReference: false });
    expect(option.checked).toBe(true);
  });

  it("counts the excluded lines in the label, so the offer is concrete", () => {
    const option = filterMenu(DEFAULT_QUERY, ctx).find((group) => group.label === "Línies")!.options[0]!;
    expect(option.label).toBe("Incloure la documentació (3)");
  });
});
