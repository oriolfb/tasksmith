import { daysBetween, formatIsoDate, startOfToday } from "../index/dates";

const MONTHS = ["gen", "febr", "març", "abr", "maig", "juny", "jul", "ag", "set", "oct", "nov", "des"];

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

/** Short absolute label used as the tooltip and in the wide view. */
export function shortDate(date: Date | null): string {
  if (!date) return "—";
  const month = MONTHS[date.getMonth()] ?? "";
  return `${date.getDate()} ${month} ${date.getFullYear()}`;
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
