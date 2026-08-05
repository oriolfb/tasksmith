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
| `task-console-sidebar` | `SidebarView` | Right dock. The focus view: two lenses (date / who with), three day slots, collapsible sections, keyboard. |
| `task-console-triage` | `TriageView` | Tab. Multi-select, bulk actions, grouping (including by person) and project filter. |

### The focus view

`Focus.focusSections` is pure and decides everything the view shows:

| Section | Contents |
|---|---|
| **Avui** | `isUrgent` first (dated today, `🔺`, or `#urgent`) — these never take a slot — then the `DAY_LIMIT` (3) you chose, then the free slots. |
| **Per renegociar** | Overdue, oldest first. Not "late": a decision not yet made. |
| **Sense data** · **Més endavant** | The rest. |

`DaySelection` holds the chosen keys in `settings.dayPlan`, stamped `YYYY-MM-DD`. A plan from
another day is dropped on read; `prune` frees the slot of a task that has been completed, deleted
or reworded. Nothing is written to the vault, which is why an unfinished day creates no debt.

Row actions are words, not buttons: **Avui · Data · No**. `No` cancels the line (status `-`), so
saying no costs exactly as much as postponing — and `⌘Z` gets it back.

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
