const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Parses `YYYY-MM-DD` to local midnight. Returns null for anything else, including `YYYY-MM-DD` literals from templates. */
export function parseIsoDate(text: string): Date | null {
  const m = ISO_DATE.exec(text.trim());
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(y, mo - 1, d);
  // Rejects impossible dates that Date would silently roll over (e.g. 2026-02-31).
  if (date.getFullYear() !== y || date.getMonth() !== mo - 1 || date.getDate() !== d) return null;
  return date;
}

export function formatIsoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function startOfToday(now: Date = new Date()): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

export function daysBetween(from: Date, to: Date): number {
  const MS_PER_DAY = 86_400_000;
  return Math.round((to.getTime() - from.getTime()) / MS_PER_DAY);
}

/**
 * End of the current week, Monday-based: Sunday of the week containing `today`.
 * Used as the upper bound of the "this week" bucket.
 */
export function endOfWeek(today: Date): Date {
  const dow = today.getDay(); // 0 = Sunday
  const daysToSunday = dow === 0 ? 0 : 7 - dow;
  return addDays(today, daysToSunday);
}
