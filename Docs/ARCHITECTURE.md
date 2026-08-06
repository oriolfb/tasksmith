# Architecture

## Purpose

Task Console indexes every task in the vault and shows it in a sidebar and a wide triage
view. Markdown stays the only source of truth; the plugin adds an index, views and quick
actions. It coexists with the Tasks plugin and writes nothing Tasks cannot read.

## Layers

```
┌──────────────────────────────────────────────────────────────┐
│ main.ts — lifecycle, views, commands, ribbon badge, events   │
└───────────────┬──────────────────────────────────────────────┘
                │
    ┌───────────┴────────────┬──────────────────┬──────────────┐
    │                        │                  │              │
┌───▼─────────┐   ┌──────────▼───────┐  ┌───────▼──────┐ ┌─────▼───────┐
│ TaskIndex   │   │ TaskActions      │  │ Query        │ │ Views       │
│ in-memory   │   │ quick actions    │  │ filter/sort/ │ │ Sidebar +   │
│ per note    │   │ over TaskWriter  │  │ group        │ │ Triage      │
└───┬─────────┘   └──────────┬───────┘  └──────────────┘ └─────────────┘
    │                        │
┌───▼──────────┐   ┌─────────▼────────┐
│ buildTasks   │   │ TaskWriter       │
│ TaskParser   │   │ vault.process,   │
│ Buckets      │   │ one line, guarded│
│ FilenameDate │   └──────────────────┘
│ ScopeFilter  │
└───┬──────────┘
    │
┌───▼───────────────────┐
│ TasksPluginSettings   │  reads obsidian-tasks-plugin/data.json
└───────────────────────┘
```

## Key decisions

**One parsing path.** `buildTasks.tasksFromFile` is used by the live index *and* by the
vault audit test. The numbers the UI shows and the numbers CI verifies cannot come from
different code.

**Spans, not re-serialization.** `TaskParser` records the offset range of every field it
recognises. Edits in `TaskLineEditor` splice `raw`, so any text the parser does not model
(an empty `⏳`, an unknown emoji, odd spacing) survives byte-for-byte. There is no
"serialize a Task back to markdown" function, by design.

**Fields are read from the end of the line**, one at a time, matching the Tasks plugin.
A marker with no valid value stays part of the description rather than becoming a null date.

**No persisted cache.** ~900 notes and ~530 task lines: a full scan runs off Obsidian's own
file cache in well under a second. `metadataCache.on("changed")` reindexes single notes.

**Config is not duplicated.** Statuses, `useFilenameAsScheduledDate`, `setDoneDate` and
friends are read from the Tasks plugin's `data.json`; excluded folders default to Obsidian's
own `userIgnoreFilters`. Our own settings only add what neither provides.

**Writes are single-line and guarded.** `TaskWriter` compares the on-disk line against the
line the index believes in, and abandons the write on mismatch. This is what makes the
plugin safe on an iCloud-synced vault.

**Deletions are batched per file, bottom-up.** Removing a line shifts every line below it,
so `deleteMany` groups by note and deletes from the highest line number down inside a single
`vault.process`. Deleting top-down would silently invalidate the rest of the batch — the
conflict guard would catch it, but as a skipped deletion rather than a correct one.

**Every write is reversible.** The conflict guard already had to know the line's previous
text, so `TaskWriter` keeps it: each successful write records `{ path, line, before, after }`
into a 50-entry `History`, and `undo()` replays the newest entry backwards under the same
guard. Records inside an entry all reference one index snapshot, so replaying them *ascending*
rebuilds the original line numbering as it goes — re-inserting line 3 puts line 7 back where
its record says it was. Bulk actions wrap their writes in `beginGroup`/`endGroup` so a batch
is one undo step.

**Empty tasks are deleted, not displayed — but only if asked.** A bare `- [ ]` left by the
daily-note template carries no information. `EmptyTaskCleaner` removes them on rebuild, on note
change, and when a note loses focus — never in the note being edited, and never when the empty
task owns subtasks (that would orphan them). Views filter them out regardless of the setting.
The setting itself is **off by default**: this is the only code path that writes to notes
without the user asking, and on an iCloud-synced vault that has to be opted into. When it does
run, the whole batch is one undo step.

**Grouping by person only fans out when there is no person filter.** `groupTasks`'s "person" mode
puts a multi-person task under every name it carries — right for the unfiltered "Amb qui" lens,
where the counts are meant to exceed the task count. But the dock's "N més" hands the wide view a
specific person as a *filter*, not just a grouping; regrouping that already-restricted list by
person still fanned a task shared with someone else back into their group, so "N més" under Carmen
surfaced Mireia and Mónica too. `runQuery` now threads `state.person` into `groupTasks`, which
collapses to a single group for that person whenever a person filter is active — filtering and
grouping can no longer disagree about who a section is for.

**The day's plan is reconciled against the index, never trusted to stay in sync.** `DaySelection`
holds `{ date, keys, done }` in the plugin's own settings while the truth about every task lives in
the notes, so `prune(tasks)` runs on each paint and answers two different questions about each key,
which an earlier version conflated into one:

| Question | Answer |
|---|---|
| Does a task with this key still exist? | No → forget the key. The line was deleted or reworded. |
| Is it still open? | No → the key leaves `keys` (the slot reopens) and joins `done` (the line stays). |

Three consequences worth keeping:

- **Every mutation stamps `date`, not just `add`.** The first thing closed on a given day can be an
  urgent task on an otherwise untouched plan — whose `date` is still `""`. Recording it without
  stamping means `forToday` wipes the record on the very next paint.
- **The write, the reindex and the view's own update race, and both orders converge.** Completing
  from a row awaits the write, then calls `markDone`; the index's change event repaints on an 80 ms
  debounce. If the repaint wins, `prune` moves the key to `done` on its own and `markDone` is a
  no-op. This is why there is no ordering guard: the two writers were made idempotent instead.
- **A `Task` handed to a callback is a snapshot, and right after a write it lies.** Its `open` is
  still the pre-write value, so any predicate derived from it — `isUrgent` in particular — is
  unreliable exactly when it would be most convenient. Reopening therefore never asks whether the
  task is urgent; it hands the key back to a free slot, and `focusSections` ignores the key anyway
  for a task that turns out to be urgent, because urgent tasks never consume a displayed slot.

Stored settings are migrated at the constructor boundary (`withDone`), so a plan written by 0.2.2
with no `done` array is normalised once instead of guarded at every read.

## The effective date

The rule the whole product hangs on:

```
effectiveDate = 📅 due ?? ⏳ scheduled ?? 🛫 start ?? filenameDate ?? noteDate* ?? null
                                                                     └ only when the note lends it
```

`filenameDate` replicates the Tasks plugin's filename-as-scheduled-date setting
(`\D\i\a\r\i YYYY-MM-DD` in this vault). Without it, an undated task written in a daily
note is invisible the moment the day passes — the exact failure the plugin exists to fix.

`noteDate` is the note's own `data:`, and it only becomes a deadline for notes whose tags or
`tipus` are listed in `ContextRules.deadlineFrom` — periodic notes by default. This distinction
is the whole point: **a task jotted down in a meeting on 27 July is not late since 27 July.**
Applying `data:` to every note would have moved 15 of 18 undated tasks into overdue overnight
(20 → 35) and made the overdue list meaningless. What the meeting date *is* good for is age, so
`ageInDays` uses it even when it is not a deadline.

Measured effect on the real vault: the three tasks in `Diari setmana 29 de 2026` — a weekly note
the filename format cannot parse — stopped being undated (overdue 20 → 23, undated 18 → 15).

## The note is the context

The 42 open tasks live in 24 notes, and all 24 have frontmatter. `NoteContext` reads:

| Key | Used for |
|---|---|
| `data` | the inherited date above, and age everywhere |
| `Persones` | the "who with" lens — **all** of them, so a task in a two-person meeting appears on both agendas |
| `tipus` | `TaskKind`: `documentacio` → `reference`, configurable → `someday`, otherwise `commitment` |
| `title` | a readable origin chip instead of `2026-06-29 - 15-01 - Seguimiento BI 2026-06-29` |
| `Àrea`, `Projecte` | grouping, as before |

`reference` and `someday` lines are **kept and never deleted**, but they stay out of
`bucketCounts` and out of the default query. A checklist inside a documentation note is never
going to be completed, and a count the user has learnt to distrust is worse than no count.

Frontmatter comes from Obsidian's `metadataCache` in the plugin. `Frontmatter.ts` is a narrow
stand-in used only when no parsed frontmatter is supplied — the vault audit test reads files with
`fs`, and an audit that could not see frontmatter could not verify any of the rules above.

Every open task then falls in exactly one bucket: `overdue`, `today`, `week`, `later`,
`undated`. Closed tasks go to `closed`.

## Rendering inside Obsidian

Every rule below was learnt from a screenshot that looked nothing like the design it came from.
They are platform facts, not taste; the visual language they serve lives in
[ROADMAP.md](ROADMAP.md#the-design-language).

**Never use `<button>` for something that is not a button.** Obsidian styles bare `button`
elements with a background, a radius, padding, a height and a shadow, and in practice that wins
over a plugin's own class — a `background: none` in our stylesheet did not survive. The symptom
was unmistakable and took two rounds to diagnose: section labels rendered as **full-width grey
boxes**
and the three action words as **grey pills heavier than the tasks themselves**. Section headings,
the checkbox and the row actions are now `div`/`span` with `role="button"`, `tabIndex` and an
Enter/Space handler, so nothing is lost accessibility-wise — the roles are deliberate, not a
side effect of dodging the styling.

**Use Obsidian's own classes when the look should be native.** Header icons carry
`clickable-icon` and only set `--icon-size`; they then match every other icon in the app for free.
The lens tabs are soft filled pills, deliberately copying the metadata "Add property" button —
the underlined-tab version read as a stray link inside the dock.

**A state colour must not be a background colour the pane already uses, and one class is not
enough specificity.** The active lens was marked with `--background-secondary`, which in the left
dock *is* the pane background, so both tabs looked identical and nothing said which lens you were
in. Themes make it worse: they style buttons as `<container> button`, which outweighs a single
`.tcf-tab` and puts the grey chrome back on both. The active tab now carries a wash, a hairline and
text all derived from `--tcf-lila` — a hue no pane background uses — and the tab rules are two
classes deep (`.tcf .tcf-tab`) so a theme cannot reach over them. State also goes into
`aria-pressed`, since a colour is not readable by a screen reader.

**`styles.css` reloads live; `main.js` does not.** Obsidian only re-reads a plugin's JavaScript
when the plugin is re-enabled, so *new CSS on old JS* is a real and misleading state: after the
markup moved off `<button>`, the CSS reset that neutralised Obsidian's button styling was removed
as no longer needed, which made that pairing render **worse than either version alone**. Two
consequences: bump `manifest.version` on every user-visible change and surface it in the settings
tab, and never trust "I reloaded" as evidence that the new code is running.

**Lay out for a 300px dock, not for the mockup's width.** Actions in a third column of the row
left the description about 190px, so every task broke into three or four lines. They moved to the
row's second line beside the context, where the space was empty anyway. Similarly,
`white-space: nowrap` on the whole meta line forced a horizontal scrollbar into the dock; the
nowrap belongs on each fragment, so the line wraps *between* items but never inside
"fa 5 setmanes".

**Animate with measured geometry, never assumed row heights.** The lens transition is FLIP —
read every row's rect, rebuild the list, invert, play. A fixed-height absolutely-positioned
version broke as soon as a description wrapped to a third line, which at dock width is the common
case. `prefers-reduced-motion` skips straight to the end state.

**A class used as a hook must never be overwritten by state.** `lead.className = "ord"` destroyed
the `.lead` hook the next paint queried, so `paint()` threw before reaching
`list.replaceChildren` — the lens button appeared to do nothing at all and no animation ran, with
no visible error. Hook and state coexist: `"lead ord"`. `TaskListRenderer` uses the same
class-as-hook pattern and is exposed to the same mistake.

**Build the summary sentence as DOM, not `innerHTML`.** It only ever interpolates counts today,
but note content is one refactor away from reaching it.

**Verify without the app where possible.** The harness at
[`mockups/06-render-real.html`](mockups/06-render-real.html) loads the real `styles.css` with the
renderer's DOM and Obsidian's CSS variables at two dock widths, and it renders bare `<button>`s
with Obsidian's styling on purpose so a regression to grey chrome is visible. It catches
structure, spacing and chrome; it cannot catch a user's theme or snippets.

## Known limitations

- **Recurring tasks are not completed by the plugin.** Generating the next instance is the
  Tasks plugin's job; completing a `🔁` task here would silently break the series, so the
  action shows a notice and asks the user to tick it in the note instead.
- No mobile-specific layout yet; the plugin loads on mobile but is designed for desktop.
- Existing ` ```tasks ` query blocks are untouched and unmanaged.
- **The rendered views cannot be verified from outside Obsidian.** Unit tests cover the pure
  section logic (`Focus.ts`) and the harness above covers the stylesheet, but nothing exercises
  `ItemView` itself — every visual regression so far was found by a user screenshot.
