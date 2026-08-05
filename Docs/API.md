# API

## Commands

| Command | Effect |
|---|---|
| `Task Console: Obrir la barra lateral de tasques` | Reveals the sidebar view in the right dock. |
| `Task Console: Obrir el centre de control` | Opens the control centre in a tab. Command id is still `open-triage`, so an existing hotkey keeps working. |
| `Task Console: Refer l'índex de tasques` | Re-reads the Tasks plugin config and rescans the vault. |
| `Task Console: Eliminar les tasques buides ara` | Deletes empty task lines outside the active note. |
| `Task Console: Desfés l'últim canvi del plugin` | Reverts the newest history entry. Hidden from the palette when there is nothing to undo. No default hotkey — `Mod+Z` belongs to the editor. |

## Views

| Id | Class | Where |
|---|---|---|
| `task-console-sidebar` | `SidebarView` | Right dock. The focus view: two lenses (date / who with), three day slots, collapsible sections, keyboard. |
| `task-console-triage` | `ControlCentreView` | Tab. The control centre: KPI strip, throughput, filter chips, sortable table, health panel. Id unchanged so saved layouts keep working. |

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

Row actions are words, not buttons: **Avui · Data**. Discarding — "No ho faré" — lives at the bottom
of the date menu, separated and marked as a warning: it cancels the line (status `-` plus `❌`), never
deletes anything, and is undoable, but it costs one deliberate step more than postponing. There is
no bare keyboard shortcut for it. Both views open that menu through `DateMenu.openDateMenu`.

### The control centre

Four pure modules decide everything it shows; the view only draws them.

| Module | Answers |
|---|---|
| `Metrics.openState` | open, notes, to renegotiate + oldest, undated + how many have a date in their note |
| `Metrics.closingState` | `✅` vs `❌`, first and last closing, **closings per working day** |
| `Metrics.monthlyClosed` | the throughput bars: one entry per month, empty months kept as zeros |
| `Health.healthFindings` | the findings, each with either a `filter` (point the table at them) or a `fix` |
| `Filters.describeFilters` / `filterMenu` | the chips and what `+ filtre` offers |

The strip and the panel always describe the **whole vault**, never the current filter. The one
finding that writes (`fix: "apply-note-date"`) copies each note's own `data:` onto its undated tasks
— guarded single-line writes, one undo step, and it asks first because it touches several notes.
Everything else in the panel points the table somewhere; the plugin never writes frontmatter.

`QueryState.sortReverse` and the `text` / `person` / `area` sort keys exist for the table's columns:
clicking the active column turns the order around, and a row with nothing in that column goes last
either way.

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
