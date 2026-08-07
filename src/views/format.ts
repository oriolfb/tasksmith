import { daysBetween, formatIsoDate, startOfToday } from "../index/dates";

/**
 * Abbreviation and full name per month. One table, two readers: the views print the
 * abbreviation, `DateInput` matches what you type against the full name. Every abbreviation is a
 * prefix of its own full name, which is what lets `set` and `setembre` mean the same month
 * without a second list to keep in step.
 */
export const MONTHS: readonly (readonly [string, string])[] = [
  ["gen", "gener"],
  ["febr", "febrer"],
  ["març", "març"],
  ["abr", "abril"],
  ["maig", "maig"],
  ["juny", "juny"],
  ["jul", "juliol"],
  ["ag", "agost"],
  ["set", "setembre"],
  ["oct", "octubre"],
  ["nov", "novembre"],
  ["des", "desembre"],
];

function monthShort(month: number): string {
  return MONTHS[month]?.[0] ?? "";
}

/** Catalan relative label for a task date, e.g. `avui`, `demà`, `fa 7 setmanes`. */
export function relativeLabel(date: Date | null, today: Date = startOfToday()): string {
  if (!date) return "sense data";

  const days = daysBetween(today, date);
  if (days === 0) return "avui";
  if (days === 1) return "demà";
  if (days === -1) return "ahir";
  if (days === 2) return "demà passat";

  const past = days < 0;
  const n = Math.abs(days);

  if (n < 7) return past ? `fa ${n} dies` : `en ${n} dies`;
  // Weeks run to eight rather than four: for a task going stale, "fa 7 setmanes" lands
  // harder and more precisely than "fa 2 mesos".
  if (n < 56) {
    const weeks = Math.round(n / 7);
    const unit = weeks === 1 ? "setmana" : "setmanes";
    return past ? `fa ${weeks} ${unit}` : `en ${weeks} ${unit}`;
  }
  if (n < 365) {
    const months = Math.round(n / 30);
    const unit = months === 1 ? "mes" : "mesos";
    return past ? `fa ${months} ${unit}` : `en ${months} ${unit}`;
  }
  const years = Math.round(n / 365);
  const unit = years === 1 ? "any" : "anys";
  return past ? `fa ${years} ${unit}` : `en ${years} ${unit}`;
}

const WEEKDAYS = ["dg", "dl", "dt", "dc", "dj", "dv", "ds"];

/** `dl.`, `dt.`, … — the column heads of the week strip. */
export function weekdayLabel(date: Date): string {
  return `${WEEKDAYS[date.getDay()] ?? ""}.`;
}

/**
 * How a single day is named once it is a filter or a column: `avui`, `demà`, else `dj. 7 ag`.
 * The year is left out on purpose — a day you are looking at is never a year away.
 */
export function dayLabel(date: Date, today: Date = startOfToday()): string {
  const days = daysBetween(today, date);
  if (days === 0) return "avui";
  if (days === 1) return "demà";
  return `${weekdayLabel(date)} ${date.getDate()} ${monthShort(date.getMonth())}`;
}

/**
 * The day a date lands on, and how long ago only when it has already gone: the date field lists
 * readings, and a day already past is the one reading you can accept by mistake. Ahead of today
 * the day names itself — "en 3 dies" beside "ds. 8 ag" is the same fact twice.
 */
export function dayWithAge(date: Date, today: Date = startOfToday()): string {
  const day = dayLabel(date, today);
  return daysBetween(today, date) < 0 ? `${day} · ${relativeLabel(date, today)}` : day;
}

/** Short absolute label used as the tooltip and in the wide view. */
export function shortDate(date: Date | null): string {
  if (!date) return "—";
  return `${date.getDate()} ${monthShort(date.getMonth())} ${date.getFullYear()}`;
}

/** Axis label for the throughput chart. The year comes along only when it is not this one. */
export function monthLabel(year: number, month: number, today: Date = startOfToday()): string {
  const name = monthShort(month);
  return year === today.getFullYear() ? name : `${name} ${String(year).slice(2)}`;
}

/** Catalan decimal: 2,5 closed per working day, not 2.5. */
export function decimal(value: number, digits = 1): string {
  return value.toFixed(digits).replace(".", ",");
}

export function isoOrDash(date: Date | null): string {
  return date ? formatIsoDate(date) : "—";
}

export function noteName(path: string): string {
  const file = path.split("/").pop() ?? path;
  return file.replace(/\.md$/, "");
}

const PRIORITY_LABELS: Record<string, string> = {
  highest: "Màxima",
  high: "Alta",
  medium: "Mitjana",
  low: "Baixa",
  lowest: "Mínima",
};

export function priorityLabel(priority: string | null): string {
  return priority ? PRIORITY_LABELS[priority] ?? priority : "Sense prioritat";
}
