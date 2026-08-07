import { addDays, addMonths, formatIsoDate, nextWeekday, parseIsoDate, startOfToday } from "../index/dates";
import { MONTHS } from "../views/format";

/**
 * What you type in the date field, read as dates.
 *
 * Pure like `Focus.ts`: text and a day in, a list of readings out. Nothing here knows about a
 * modal, which is what lets every rule below be a test rather than a screenshot.
 *
 * It never guesses silently. An input it cannot read returns nothing, an ambiguous one returns
 * every reading it has — the field lists them and `↵` takes the first, so the date you are about
 * to write is on screen before you accept it.
 */
export interface DateMatch {
  /** What the typed text means, in words: "Divendres que ve", "En 3 dies", "15 de març de 2026". */
  label: string;
  date: Date;
}

/** Typed form, how it is named back, and the offset in days. */
const NAMED_DAYS: readonly [string, string, number][] = [
  ["avui", "Avui", 0],
  ["dema", "Demà", 1],
  ["dema passat", "Demà passat", 2],
];

/** Short form, full name, `Date.getDay()`. No accent in any of them, so the label is the name. */
const WEEKDAYS: readonly [string, string, number][] = [
  ["dl", "dilluns", 1],
  ["dt", "dimarts", 2],
  ["dc", "dimecres", 3],
  ["dj", "dijous", 4],
  ["dv", "divendres", 5],
  ["ds", "dissabte", 6],
  ["dg", "diumenge", 0],
];

const MONDAY = 1;
const FRIDAY = 5;

/** "dv que ve", "divendres vinent": the weekday of next week rather than the next one. */
const NEXT_WEEK = /\s+(?:que ve|vinent)$/;

/**
 * `3d`, `+3`, `3 dies`, `2s`, `2 setmanes`, `1m`, `2 mesos`, and a bare number as days.
 *
 * `set` is deliberately not a week unit: it is September's abbreviation, and "15 set" has to
 * mean the fifteenth of September and nothing else.
 */
const AMOUNT = /^\+?(\d{1,4})\s*(dies?|d|setmanes?|s|mesos|mes|m)?$/;
const NUMERIC = /^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2}|\d{4}))?$/;
const DAY_MONTH = /^(\d{1,2})\s+(?:de\s+|d')?([a-z]+)$/;

/** Beyond this, a figure is a typo and not a plan. */
const MAX_AMOUNT = 999;

export function parseDateInput(text: string, today: Date = startOfToday()): DateMatch[] {
  const typed = normalise(text);
  if (typed === "") return dedupe(defaults(today));
  return dedupe([
    ...namedDays(typed, today),
    ...weekdays(typed, today),
    ...amounts(typed, today),
    ...written(typed, today),
  ]);
}

/**
 * The empty field: the same offers as the menu it was opened from, in the same order, so the
 * field is never a dead end for someone who opened it without a phrase in mind.
 */
function defaults(today: Date): DateMatch[] {
  return [
    { label: "Avui", date: today },
    { label: "Demà", date: addDays(today, 1) },
    { label: "Divendres", date: nextWeekday(today, FRIDAY) },
    { label: "Dilluns que ve", date: nextWeekday(today, MONDAY) },
    { label: "En 1 setmana", date: addDays(today, 7) },
    { label: "En 1 mes", date: addMonths(today, 1) },
  ];
}

function namedDays(typed: string, today: Date): DateMatch[] {
  return NAMED_DAYS.filter(([form]) => form.startsWith(typed)).map(([, label, days]) => ({
    label,
    date: addDays(today, days),
  }));
}

function weekdays(typed: string, today: Date): DateMatch[] {
  const nextWeek = NEXT_WEEK.test(typed);
  const token = typed.replace(NEXT_WEEK, "");
  if (token === "") return [];

  return WEEKDAYS.filter(([short, full]) => short.startsWith(token) || full.startsWith(token))
    .map(([, full, weekday]) => ({
      label: nextWeek ? `${capitalise(full)} que ve` : capitalise(full),
      date: nextWeek ? weekdayOfNextWeek(today, weekday) : nextWeekday(today, weekday),
    }))
    .sort(byDate);
}

/** Monday-based: Friday of next week is four days after next week's Monday. */
function weekdayOfNextWeek(today: Date, weekday: number): Date {
  return addDays(nextWeekday(today, MONDAY), (weekday + 6) % 7);
}

function amounts(typed: string, today: Date): DateMatch[] {
  const match = AMOUNT.exec(typed);
  if (!match) return [];

  const n = Number(match[1]);
  if (n < 1 || n > MAX_AMOUNT) return [];

  const unit = match[2] ?? "d";
  if (unit.startsWith("s")) {
    return [{ label: `En ${n} ${plural(n, "setmana", "setmanes")}`, date: addDays(today, n * 7) }];
  }
  if (unit.startsWith("m")) {
    return [{ label: `En ${n} ${plural(n, "mes", "mesos")}`, date: addMonths(today, n) }];
  }
  return [{ label: `En ${n} ${plural(n, "dia", "dies")}`, date: addDays(today, n) }];
}

function written(typed: string, today: Date): DateMatch[] {
  const iso = parseIsoDate(typed);
  if (iso) return [written1(iso)];

  const numeric = NUMERIC.exec(typed);
  if (numeric) {
    const year = numeric[3] === undefined ? today.getFullYear() : fullYear(Number(numeric[3]));
    return calendar(year, Number(numeric[2]) - 1, Number(numeric[1]), numeric[3] !== undefined, today);
  }

  const named = DAY_MONTH.exec(typed);
  if (!named) return [];
  const token = named[2]!;
  const day = Number(named[1]);
  return MONTHS.flatMap(([, full], month) =>
    normalise(full).startsWith(token) ? calendar(today.getFullYear(), month, day, false, today) : []
  ).sort(byDate);
}

/**
 * A date typed without a year is read in this one, exactly as written — and when that day has
 * already gone, next year's is offered under it. Both readings of "15/3" in August are real, so
 * the field shows both rather than picking one and being wrong half the time.
 */
function calendar(
  year: number,
  month: number,
  day: number,
  explicitYear: boolean,
  today: Date
): DateMatch[] {
  const date = exactDate(year, month, day);
  if (!date) return [];
  const matches = [written1(date)];
  if (!explicitYear && date.getTime() < today.getTime()) {
    const nextYear = exactDate(year + 1, month, day);
    if (nextYear) matches.push(written1(nextYear));
  }
  return matches;
}

/** Spelled out in full, year included: the year is the part of a typed date that surprises you. */
function written1(date: Date): DateMatch {
  const full = MONTHS[date.getMonth()]?.[1] ?? "";
  const de = /^[aeiou]/.test(full) ? "d'" : "de ";
  return { label: `${date.getDate()} ${de}${full} de ${date.getFullYear()}`, date };
}

/** Rejects what `Date` would roll over instead: 31 February is not 3 March, it is nothing. */
function exactDate(year: number, month: number, day: number): Date | null {
  if (month < 0 || month > 11 || day < 1 || day > 31) return null;
  const date = new Date(year, month, day);
  const exact = date.getFullYear() === year && date.getMonth() === month && date.getDate() === day;
  return exact ? date : null;
}

function fullYear(typed: number): number {
  return typed < 100 ? 2000 + typed : typed;
}

/**
 * Two readings that land on the same day are one offer. On a Friday "divendres" and
 * "+1 setmana" are the same date, and listing both is listing one day under two names.
 */
function dedupe(matches: DateMatch[]): DateMatch[] {
  const seen = new Set<string>();
  return matches.filter((match) => {
    const key = formatIsoDate(match.date);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Accents and case are what you skip when you are typing fast: `marc` is `març`, `DEMÀ` is `demà`. */
function normalise(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function byDate(a: DateMatch, b: DateMatch): number {
  return a.date.getTime() - b.date.getTime();
}

function capitalise(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many;
}
