# API

## Commands

| Command | Effect |
|---|---|
| `TaskSmith: Obrir la barra lateral de tasques` | Reveals the sidebar view in the right dock. |
| `TaskSmith: Obrir el centre de control` | Opens the control centre in a tab. The command id is still `open-triage` from when the tab was the triage view. |
| `TaskSmith: Refer l'índex de tasques` | Re-reads the Tasks plugin config and rescans the vault. |
| `TaskSmith: Eliminar les tasques buides ara` | Deletes empty task lines outside the active note. |
| `TaskSmith: Desfés l'últim canvi del plugin` | Reverts the newest history entry. Hidden from the palette when there is nothing to undo. No default hotkey — `Mod+Z` belongs to the editor. |

## Views

| Id | Class | Where |
|---|---|---|
| `task-smith-sidebar` | `SidebarView` | Right dock. The focus view: two lenses (date / who with), three day slots, collapsible sections, keyboard. |
| `task-smith-triage` | `ControlCentreView` | Tab. The control centre: KPI strip, the week ahead, a folded history, filter chips, sortable table, health panel. Still `-triage` from when the tab was the triage view. |

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

`prune(tasks)` is a no-op on an empty list, and callers check `index.ready` first. Both say the
same thing: an index still loading is not a vault where every chosen task has been deleted.

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
| `Metrics.weekAhead` | the week strip: one column per day from today, plus what the seven days leave out (`overdue`, `later`, `undated`) |
| `Metrics.monthlyFlow` | the history bars: `created` and `closed` per month, plus `stillOpen` — the part of that month's intake never resolved |
| `Health.healthFindings` | the findings, each with either a `filter` (point the table at them) or a `fix` |
| `Filters.describeFilters` / `filterMenu` | the chips and what `+ filtre` offers |

**The week ahead** is the only thing on the page about the future, and the only one shown by
default: rolling seven days from today, not Monday to Sunday, because on a Thursday a calendar week
answers "what is coming" with three days. Clicking a column filters the table to the days it stands
for (`QueryState.dueOn`, a list of `YYYY-MM-DD`); its five figures partition the open commitments
exactly once, which the vault audit asserts. A day over `closingState.perWorkingDay` is marked.

`settings.showWeekends` decides whether Saturday and Sunday get columns. Off, the strip runs over
seven **working** days and each hidden weekend day is folded into the column that follows it —
`DayLoad.days` lists every date the column covers and `DayLoad.absorbed` how many of its tasks came
from the weekend, which the tooltip says in words and the foot of the bar draws in the neutral tone.
Folded, never dropped: the partition holds either way, and the number on a column always opens
exactly the rows it counted. Today keeps its column even when today is a Saturday.

**The history** — created against closed per month — is folded away behind `settings.showHistory`,
its own flag rather than a `collapsedSections` entry, because it is closed until asked for. Inflow
is counted by `Buckets.originDate` (the line's `➕`, else the date of the note it lives in, else
nothing), which the caption says out loud: 19 of 461 lines in the vault carry a `➕`, so without the
fallback there is no inflow to chart.

The strip and the panel always describe the **whole vault**, never the current filter. The one
finding that writes (`fix: "apply-note-date"`) copies each note's own `data:` onto its undated tasks
— guarded single-line writes, one undo step, and it asks first because it touches several notes.
Everything else in the panel points the table somewhere; the plugin never writes frontmatter.

`QueryState.dueOn` narrows to named days and is not expressible as a bucket — "dijous" is neither
"avui" nor "aquesta setmana". A list rather than one day, because a Monday carrying a hidden weekend
is one column standing for three dates. It and `buckets` answer the same question, so `applyFilter`
drops the days whenever a patch sets `buckets` without naming any; every deadline entry in
`+ filtre` does the same. That is what stops "per renegociar" from landing on an empty table because
Thursday was still selected. The chip names one day (`amb data dv. 7 ag`) or a run (`amb data del
ds. 8 ag al dl. 10 ag`).

`QueryState.sortReverse` and the `text` / `person` / `area` sort keys exist for the table's columns:
clicking the active column turns the order around, and a row with nothing in that column goes last
either way.

A section past its `SECTION_LIMIT` rows shows an "N més" link instead of the rest. Clicking it opens
the triage view scoped to that section, not the unfiltered list: `SidebarView.filterFor(section)`
turns the section key into a `Partial<QueryState>` (a person section becomes `{ group: "person",
person }`; a date section becomes the matching `{ group: "bucket", buckets }`), and
`BaseTaskView.applyFilter(patch)` merges it into the triage view's query and refreshes.

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
`<vault>/.obsidian/plugins/task-smith/`. Target vault: `TASK_SMITH_VAULT` or the
default Bershka path. Nothing else is written to the vault.
