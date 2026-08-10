const PERSON_PREFIX = /^([\p{Lu}][\p{L}'-]*):\s+(.*)$/su;

/**
 * A leading "Nom:" is shorthand for assigning that person, but only when the name is already
 * known elsewhere in the vault — otherwise "Idea: ..." or "Nota: ..." would misread as a person.
 */
export function extractPersonPrefix(
  description: string,
  knownPeople: ReadonlySet<string>
): { name: string; rest: string } | null {
  const match = PERSON_PREFIX.exec(description);
  if (!match) return null;
  const name = match[1]!;
  if (!knownPeople.has(name)) return null;
  return { name, rest: match[2] ?? "" };
}
