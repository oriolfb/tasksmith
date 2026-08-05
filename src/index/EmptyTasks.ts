import type { FieldKey, Task } from "../types/task";

/**
 * Fields that may be present on a task still considered empty. `➕ created` is written
 * automatically by the Tasks plugin, so a placeholder created through it is still a
 * placeholder. Anything else (a date, a recurrence, an id) means someone put information in.
 */
const IGNORABLE_FIELDS: FieldKey[] = ["created"];

/**
 * A task line carrying no information: no text, no tags, no links, no meaningful fields.
 * These come from templates (`## ☑️ Noves tasques` leaves a bare `- [ ]`) and are pure
 * noise in any list. Never true for a task that owns nested items.
 */
export function isEmptyTask(task: Task): boolean {
  if (task.hasChildren) return false;
  if (task.description.trim().length > 0) return false;
  if (task.tags.length > 0 || task.links.length > 0) return false;

  for (const key of Object.keys(task.fields) as FieldKey[]) {
    if (!IGNORABLE_FIELDS.includes(key)) return false;
  }
  return true;
}
