/**
 * Decides which notes count as task sources. Blacklist by design: a new folder is
 * indexed automatically, so work can never disappear because a whitelist was stale.
 */
export class ScopeFilter {
  private readonly prefixes: string[];

  constructor(excludedFolders: string[]) {
    this.prefixes = excludedFolders
      .map((folder) => folder.trim().replace(/^\/+|\/+$/g, ""))
      .filter((folder) => folder.length > 0);
  }

  /** `path` is vault-relative, e.g. `01 Diari/2026/03/Diari 2026-03-10.md`. */
  includes(path: string): boolean {
    return !this.prefixes.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
  }

  get excluded(): readonly string[] {
    return this.prefixes;
  }
}

/** Obsidian's own "Excluded files" setting, so we honour what the user already configured. */
export function parseObsidianIgnoreFilters(appJson: string): string[] {
  try {
    const raw = JSON.parse(appJson) as { userIgnoreFilters?: unknown };
    if (!Array.isArray(raw.userIgnoreFilters)) return [];
    return raw.userIgnoreFilters.filter((f): f is string => typeof f === "string");
  } catch {
    return [];
  }
}
