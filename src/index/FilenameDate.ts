import type { TasksInterop } from "../tasks/TasksPluginSettings";
import { parseIsoDate } from "./dates";

type Token = "YYYY" | "MM" | "DD";

interface Compiled {
  re: RegExp;
  order: Token[];
}

const cache = new Map<string, Compiled | null>();

/**
 * Replicates the Tasks plugin's "use filename as scheduled date" behaviour for the
 * moment-style format it stores, e.g. `\D\i\a\r\i YYYY-MM-DD` matching `Diari 2026-03-10`.
 * Only YYYY/MM/DD tokens are supported; any other token disables the feature rather
 * than guessing, so we never invent a date the Tasks plugin would not produce.
 */
export function filenameDate(basename: string, folder: string, interop: TasksInterop): Date | null {
  if (!interop.useFilenameAsScheduledDate) return null;
  if (!inScopedFolders(folder, interop.filenameAsDateFolders)) return null;

  const compiled = compile(interop.filenameAsScheduledDateFormat);
  if (!compiled) return null;

  const m = compiled.re.exec(basename);
  if (!m) return null;

  const parts: Record<Token, string> = { YYYY: "", MM: "", DD: "" };
  compiled.order.forEach((token, i) => {
    parts[token] = m[i + 1] ?? "";
  });
  if (!parts.YYYY || !parts.MM || !parts.DD) return null;

  return parseIsoDate(`${parts.YYYY}-${parts.MM}-${parts.DD}`);
}

function inScopedFolders(folder: string, scoped: string[]): boolean {
  if (scoped.length === 0) return true;
  return scoped.some((s) => folder === s || folder.startsWith(`${s}/`));
}

function compile(format: string): Compiled | null {
  const cached = cache.get(format);
  if (cached !== undefined) return cached;

  const result = build(format);
  cache.set(format, result);
  return result;
}

function build(format: string): Compiled | null {
  if (!format) return null;

  const order: Token[] = [];
  let source = "";
  let i = 0;

  while (i < format.length) {
    const ch = format[i];
    if (ch === "\\") {
      const literal = format[i + 1];
      if (literal !== undefined) source += escapeRegex(literal);
      i += 2;
      continue;
    }
    if (format.startsWith("YYYY", i)) {
      source += "(\\d{4})";
      order.push("YYYY");
      i += 4;
      continue;
    }
    if (format.startsWith("MM", i)) {
      source += "(\\d{2})";
      order.push("MM");
      i += 2;
      continue;
    }
    if (format.startsWith("DD", i)) {
      source += "(\\d{2})";
      order.push("DD");
      i += 2;
      continue;
    }
    if (ch === undefined) break;
    // An unsupported moment token would silently mis-parse; bail out instead.
    if (/[A-Za-z]/.test(ch)) return null;
    source += escapeRegex(ch);
    i += 1;
  }

  if (order.length !== 3) return null;
  return { re: new RegExp(`^${source}$`), order };
}

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
