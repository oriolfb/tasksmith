# API

## Commands

| Command | Effect |
|---|---|
| `Task Console: Obrir la barra lateral de tasques` | Reveals the sidebar view in the right dock. |
| `Task Console: Obrir la vista de triatge` | Opens the wide triage view in a tab. |
| `Task Console: Refer l'índex de tasques` | Re-reads the Tasks plugin config and rescans the vault. |
| `Task Console: Eliminar les tasques buides ara` | Deletes empty task lines outside the active note. |
| `Task Console: Desfés l'últim canvi del plugin` | Reverts the newest history entry. Hidden from the palette when there is nothing to undo. No default hotkey — `Mod+Z` belongs to the editor. |

## Views

| Id | Class | Where |
|---|---|---|
| `task-console-sidebar` | `SidebarView` | Right dock. Bucket pills, search, sort, stale toggle. |
| `task-console-triage` | `TriageView` | Tab. Multi-select, bulk actions, grouping and project filter. |

## Quick actions (`TaskActions`)

All go through `TaskWriter` and return a `WriteResult`.

| Method | Writes |
|---|---|
| `today` / `tomorrow` / `nextWeek` | `📅 <date>` |
| `scheduleOn(task, date)` | `📅 <date>` |
| `postpone(task, days)` | `📅` shifted from the task's own date, or today if it has none |
| `clearDue` | removes `📅` |
| `setPriority(task, p \| null)` | priority marker, or removes it |
| `complete` | status `x` (+ `✅` when Tasks has `setDoneDate`). Returns `null` and shows a notice for `🔁` tasks. |
| `cancel` | status `-` (+ `❌` when Tasks has `setCancelledDate`) |
| `reopen` | status `" "`, removes `✅` and `❌` |
| `cycleStatus` | follows `nextStatusSymbol` from the Tasks plugin config |
| `remove` | deletes the whole line |
| `removeMany` | deletes many lines, grouped per file and applied bottom-up |

## WriteResult

```ts
{ ok: true; line: string }
| { ok: false; reason: "missing-file" | "missing-line" | "conflict" | "unparsable" }
```

`conflict` means the on-disk line no longer matches what the index held; the write was
abandoned and the user is told to retry.

## Undo

Every successful write is recorded in `History` (a ring of 50 entries) as one or more
`WriteRecord`s — `{ path, line, before, after }`, where a `null` marks a line that did not
exist. `TaskWriter.undo()` pops the newest entry and reverses its records:

```ts
{ ok: true; label: string; restored: number; skipped: number }
| { ok: false; reason: "empty" }
```

Reversal keeps the same conflict guard as a forward write, so a line touched since is left
alone and counted in `skipped`. `TaskActions.beginGroup(label)` / `endGroup()` fold a bulk
action's writes into a single entry, so twenty rescheduled tasks are one undo step.

Destructive actions (delete, bulk delete, cancel, empty-task cleaning) show their notice
through `undoableNotice`, which puts a **Desfés** button inside the notice itself.

## Ribbon

A `list-checks` icon opens the sidebar. When `showOverdueBadge` is on it carries a badge
with the overdue count.

## Deploy

`npm run deploy` builds and copies `main.js`, `manifest.json` and `styles.css` into
`<vault>/.obsidian/plugins/task-console/`. Target vault: `TASK_CONSOLE_VAULT` or the
default Bershka path. Nothing else is written to the vault.
