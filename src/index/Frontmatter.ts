/**
 * A frontmatter reader for when Obsidian's is not available.
 *
 * In the plugin, `metadataCache.getFileCache(file).frontmatter` is the source and this code
 * never runs. It exists because the vault audit test reads files off disk with `fs`, and an
 * audit that could not see frontmatter could not verify the rules that depend on it.
 *
 * Deliberately narrow: it covers the shapes this vault actually uses — scalars, inline
 * `[a, b]` lists, and `- item` block lists, with quotes and `[[wikilinks]]` — and nothing
 * else. Anything it cannot read comes back as a missing key rather than a wrong value.
 */
export function parseFrontmatterBlock(content: string): Record<string, unknown> | undefined {
  if (!content.startsWith("---")) return undefined;
  const end = content.indexOf("\n---", 3);
  if (end === -1) return undefined;

  const body = content.slice(content.indexOf("\n") + 1, end + 1);
  const out: Record<string, unknown> = {};

  let key: string | null = null;
  let list: string[] | null = null;

  const flush = (): void => {
    if (key === null) return;
    if (list !== null && list.length > 0) out[key] = list;
    list = null;
  };

  for (const line of body.split("\n")) {
    if (line.trim() === "" || line.trimStart().startsWith("#")) continue;

    const item = /^\s*-\s+(.*)$/.exec(line);
    if (item && key !== null) {
      const value = scalar(item[1] ?? "");
      if (value !== null) (list ??= []).push(value);
      continue;
    }

    const pair = /^([^\s:][^:]*):(.*)$/.exec(line);
    if (!pair) continue;

    flush();
    key = pair[1]!.trim();
    const rest = (pair[2] ?? "").trim();

    if (rest === "") {
      // Either an empty key or the header of a block list; the next lines decide.
      out[key] = "";
      continue;
    }
    if (rest.startsWith("[") && rest.endsWith("]")) {
      out[key] = rest
        .slice(1, -1)
        .split(",")
        .map((part) => scalar(part))
        .filter((part): part is string => part !== null);
      continue;
    }
    const value = scalar(rest);
    out[key] = value ?? "";
  }
  flush();

  return out;
}

/** Strips quotes and surrounding whitespace. Returns null for an empty value. */
function scalar(text: string): string | null {
  const trimmed = text.trim().replace(/^["'](.*)["']$/, "$1").trim();
  return trimmed.length > 0 ? trimmed : null;
}
