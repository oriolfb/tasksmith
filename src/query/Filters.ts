import type { Bucket } from "../types/task";
import { daysBetween, parseIsoDate } from "../index/dates";
// Pure text formatting, no DOM: the one thing `views/` holds that a query module may borrow,
// rather than keeping a second copy of the Catalan month names here.
import { dayLabel } from "../views/format";
import { NO_PROJECT, type QueryState } from "./Query";
import { t } from "../i18n/strings";

/**
 * The filter bar reads as a sentence.
 *
 * Six permanent dropdowns weigh the same whether you use them or not, so the control centre
 * shows what is filtered — "obertes · per renegociar · és una tasca" — and nothing else. Each
 * chip clears itself, which is what makes the implicit filters honest: the two that are on by
 * default (open only, no documentation) are chips too, so you can see them and switch them off.
 */
export interface FilterChip {
  key: string;
  label: string;
  /** What clearing this chip does to the query. */
  clear: Partial<QueryState>;
}

export interface ChipContext {
  staleThresholdDays: number;
  /** Only used to name the day filter: `avui` and `demà` beat `dj. 7 ag`. */
  today?: Date;
  /** Documentation lines in the vault; the exclusion chip is hidden when there are none. */
  referenceLines: number;
  somedayLines: number;
}

const BUCKET_CHIPS: Record<Bucket, string> = {
  overdue: t("bucket.overdue"),
  today: t("bucket.today"),
  // Not "aquesta setmana": the bucket runs from tomorrow to Sunday, and a filter called "this
  // week" that hides what is due today is a filter that lies. That name belongs to `today|week`.
  week: t("bucket.week"),
  nextWeek: t("bucket.nextWeek"),
  month: t("bucket.month"),
  later: t("bucket.later"),
  undated: t("bucket.undated"),
  closed: t("bucket.closed"),
};

/** Combinations that have a name of their own, so two chips do not say one thing. Keys sorted. */
const BUCKET_SETS: Record<string, string> = {
  "today|week": t("bucketSet.thisWeek"),
  "later|month|nextWeek|week": t("bucketSet.later"),
  "overdue|undated": t("bucketSet.toDecide"),
  "later|month|nextWeek|overdue|today|undated|week": t("bucketSet.allOpen"),
};

export function describeFilters(query: QueryState, ctx: ChipContext): FilterChip[] {
  const chips: FilterChip[] = [];

  if (query.statusScope === "open") {
    chips.push({ key: "status", label: t("chip.status.open"), clear: { statusScope: "all" } });
  } else if (query.statusScope === "closed") {
    chips.push({ key: "status", label: t("chip.status.closed"), clear: { statusScope: "open" } });
  } else {
    chips.push({ key: "status", label: t("chip.status.all"), clear: { statusScope: "open" } });
  }

  if (query.buckets && query.buckets.length > 0) {
    chips.push({ key: "buckets", label: bucketsLabel(query.buckets), clear: { buckets: null } });
  }

  if (query.dueOn !== null && query.dueOn.length > 0) {
    chips.push({ key: "dueOn", label: daysLabel(query.dueOn, ctx.today), clear: { dueOn: null } });
  }

  if (query.text.trim()) {
    chips.push({ key: "text", label: t("chip.text", { text: query.text.trim() }), clear: { text: "" } });
  }

  if (query.project !== null) {
    chips.push({
      key: "project",
      label: query.project === NO_PROJECT ? t("chip.noProject") : t("chip.project", { project: query.project }),
      clear: { project: null },
    });
  }

  if (query.area !== null) {
    chips.push({ key: "area", label: t("chip.area", { area: query.area || t("chip.noArea") }), clear: { area: null } });
  }

  if (query.person !== null) {
    chips.push({ key: "person", label: t("chip.person", { person: query.person }), clear: { person: null } });
  }

  if (query.staleOnly) {
    chips.push({
      key: "stale",
      label: t("chip.stale", { days: ctx.staleThresholdDays }),
      clear: { staleOnly: false },
    });
  }

  if (query.noteDatableOnly) {
    chips.push({ key: "noteDatable", label: t("chip.noteDatable"), clear: { noteDatableOnly: false } });
  }

  // Only worth saying when the vault actually holds such lines.
  if (ctx.referenceLines > 0) {
    chips.push(
      query.includeReference
        ? { key: "reference", label: t("chip.reference.on"), clear: { includeReference: false } }
        : { key: "reference", label: t("chip.reference.off"), clear: { includeReference: true } }
    );
  }
  if (ctx.somedayLines > 0) {
    chips.push(
      query.includeSomeday
        ? { key: "someday", label: t("chip.someday.on"), clear: { includeSomeday: false } }
        : { key: "someday", label: t("chip.someday.off"), clear: { includeSomeday: true } }
    );
  }

  return chips;
}

/**
 * "amb data dv. 7 ag", or "amb data del ds. 8 al dl. 10 ag" for a Monday that is carrying its
 * weekend. The run is named as a run rather than listed, because three chips' worth of dates in
 * one chip is not a sentence anybody reads.
 */
export function daysLabel(days: string[], today?: Date): string {
  const dates = days.map(parseIsoDate).filter((date): date is Date => date !== null);
  if (dates.length === 0) return t("days.fallback", { days: days.join(", ") });
  if (dates.length === 1) return t("days.single", { day: dayLabel(dates[0]!, today) });

  const first = dates[0]!;
  const last = dates[dates.length - 1]!;
  const consecutive = daysBetween(first, last) === dates.length - 1;
  return consecutive
    ? t("days.range", { first: dayLabel(first, today), last: dayLabel(last, today) })
    : t("days.list", { days: dates.map((date) => dayLabel(date, today)).join(" o ") });
}

export function bucketsLabel(buckets: Bucket[]): string {
  const key = [...buckets].sort().join("|");
  const named = BUCKET_SETS[key];
  if (named) return named;
  return buckets.map((bucket) => BUCKET_CHIPS[bucket]).join(" o ");
}

export interface FilterOption {
  label: string;
  patch: Partial<QueryState>;
  checked: boolean;
}

export interface FilterGroup {
  label: string;
  options: FilterOption[];
}

/**
 * What `+ filtre` offers. The dynamic lists — projects, areas, people — are built by the view
 * from the index; everything with a fixed set of values lives here so it can be tested.
 */
export function filterMenu(query: QueryState, ctx: ChipContext): FilterGroup[] {
  // Menu entries are sentences of their own, so they start with a capital; chips are fragments of
  // one sentence, so they do not.
  // Every deadline option clears the day filter: a bucket and a single day are two answers to
  // the same question, and a table filtered by both would show a list nothing in the bar explains.
  const bucketOption = (buckets: Bucket[]): FilterOption => ({
    label: capitalise(bucketsLabel(buckets)),
    patch: { buckets, dueOn: null },
    checked: query.dueOn === null && sameBuckets(query.buckets, buckets),
  });

  const groups: FilterGroup[] = [
    {
      label: t("filterMenu.status"),
      options: (["open", "closed", "all"] as const).map((scope) => ({
        label:
          scope === "open"
            ? t("filterMenu.status.open")
            : scope === "closed"
              ? t("filterMenu.status.closed")
              : t("filterMenu.status.all"),
        patch: { statusScope: scope },
        checked: query.statusScope === scope,
      })),
    },
    {
      label: t("filterMenu.deadline"),
      options: [
        {
          label: t("filterMenu.deadline.all"),
          patch: { buckets: null, dueOn: null },
          checked: query.buckets === null && query.dueOn === null,
        },
        bucketOption(["overdue"]),
        bucketOption(["today"]),
        // Today included, because a week you are planning starts today, not tomorrow.
        bucketOption(["today", "week"]),
        bucketOption(["nextWeek"]),
        bucketOption(["month"]),
        bucketOption(["later"]),
        bucketOption(["undated"]),
        bucketOption(["week", "nextWeek", "month", "later"]),
        {
          label: t("filterMenu.deadline.noteDatable"),
          patch: { noteDatableOnly: !query.noteDatableOnly },
          checked: query.noteDatableOnly,
        },
      ],
    },
    {
      label: t("filterMenu.age"),
      options: [
        {
          label: t("filterMenu.age.stale", { days: ctx.staleThresholdDays }),
          patch: { staleOnly: !query.staleOnly },
          checked: query.staleOnly,
        },
      ],
    },
  ];

  const lines: FilterOption[] = [];
  if (ctx.referenceLines > 0) {
    lines.push({
      label: t("filterMenu.lines.reference", { count: ctx.referenceLines }),
      patch: { includeReference: !query.includeReference },
      checked: query.includeReference,
    });
  }
  if (ctx.somedayLines > 0) {
    lines.push({
      label: t("filterMenu.lines.someday", { count: ctx.somedayLines }),
      patch: { includeSomeday: !query.includeSomeday },
      checked: query.includeSomeday,
    });
  }
  if (lines.length > 0) groups.push({ label: t("filterMenu.lines"), options: lines });

  return groups;
}

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function sameBuckets(a: Bucket[] | null, b: Bucket[]): boolean {
  if (!a || a.length !== b.length) return false;
  return [...a].sort().join("|") === [...b].sort().join("|");
}
