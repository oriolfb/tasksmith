# Changelog

## Unreleased

### Changed

- **A task you finish stays in "Avui", struck through.** It used to vanish, which left the same
  three empty slots at six in the evening as at nine in the morning — the day read as if nothing
  had happened. Finished tasks now sit at the foot of the section under a quiet "fetes avui", with
  the one ticked box in the view; clicking it undoes the completion and hands the task back to a
  free slot. The record lives in `dayPlan.done` and dies at midnight with the plan, and it also
  picks up tasks you tick off in the note itself.
- **Finishing one of the three frees its slot.** The 1·2·3 counts what is still live, so it closes
  up, and the invitation to pick another one comes back — in `--text-muted` rather than
  `--text-faint`, because an offer whispered in grey reads as something switched off. The sentence
  above the list and the section's small print both say how many you have closed.

### Added

- **"N més" hands off to the triage view, filtered to the same tasks.** Clicking the overflow link
  under a dock section now opens the wide view already scoped to it — the same person, or the same
  date bucket — instead of landing on the unfiltered list. `BaseTaskView.applyFilter` merges a
  partial `QueryState` into the view and refreshes; `SidebarView.filterFor` maps each section key to
  its equivalent filter.
- `Docs/ARCHITECTURE.md` gains a **Rendering inside Obsidian** section: why a `<button>` cannot be
  used for something that is not a button, why `styles.css` reloading live while `main.js` does not
  produces a misleading "nothing changed" state, why the row lays out for a 300px dock, why the lens
  transition measures real geometry, and how `mockups/06-render-real.html` verifies the stylesheet
  without opening Obsidian. Every rule came from a screenshot that looked nothing like its design.
- Two more entries in the ROADMAP's trap list: overwriting a class that is also a query hook (a
  control that silently does nothing means the render threw halfway), and explaining away a
  screenshot instead of diagnosing it.
- A key decision in `Docs/ARCHITECTURE.md` on **reconciling the day's plan against the index**: the
  two questions `prune` has to keep apart (does the task still exist / is it still open), why every
  mutation stamps the plan's date and not just `add`, why the write, the reindex and the view's own
  update are left to race because both orders converge, and why a `Task` snapshot lies about `open`
  immediately after a write — which is what rules out asking `isUrgent` on reopen.
- The CSS harness `mockups/06-render-real.html` now styles its buttons as `.dock button`, with a
  border, so it reproduces the specificity a real theme uses instead of a bare element selector.
  Two more traps in the ROADMAP and one more rule in ARCHITECTURE's rendering section: a state
  colour must not be a colour the pane already uses, and one class does not beat a theme.

### Fixed

- **A person filter no longer re-fans a shared task to co-named people.** `groupTasks`'s "person"
  mode groups every task by all the people it names, which is correct for the unfiltered "Amb qui"
  lens but wrong once a specific person is the filter: a task shared between Carmen and Mireia
  surfaced a Mireia group too, even though only Carmen's tasks were asked for. `runQuery` now
  passes the active person filter through, and `groupTasks` collapses to that one person's group
  when it is set.
- **You can see which lens you are in.** The active tab was marked with `--background-secondary`,
  which in the left dock *is* the pane background, so «Per data» and «Amb qui» looked identical —
  and a theme's `<container> button` rules outweighed our single `.tcf-tab` and put the same grey
  chrome on both. The active tab now carries a lila wash, a lila hairline and lila text, all derived
  from `--tcf-lila` so overriding the accent in a snippet keeps them in step, and the tab rules sit
  two classes deep where a theme cannot reach them. The state also goes into `aria-pressed`, since a
  colour is not readable by a screen reader.

## 0.2.2

### Fixed

- **You can complete the three tasks you chose for today.** The ordinal replaced the checkbox, so
  the only tasks in the view you could not tick off were the ones you had committed to. It now sits
  beside the box.
- The lens tabs are soft pills like Obsidian's own "Add property" button; the underlined version
  read as a stray link.
- Header icons use Obsidian's `clickable-icon`, so they lose the border and match every other icon
  in the app.

### Changed

- **"No ho faré" moved out of the row** and into the bottom of the date menu, separated and marked
  as a warning. It was one careless click from cancelling a task — recoverable, but you would have
  had to go looking for it. There is deliberately no bare keyboard shortcut for it.
- Once the three slots are full, the rest of the list drops to 45% opacity: the day is decided, and
  the pool is there for reference rather than for more deciding. It brightens on hover.
- A person is now a heading, not a filing label: full size, normal case, 30px of air above. The
  "7 converses tanquen…" line gained a rule beneath it so it stops crowding the first name.
- The vault audit no longer pins the number of weekly-note tasks — an invariant plus a synthetic
  case, because the count went to zero the moment the notes were used for real.

### Added

- **"N més" opens the wide view already filtered to those tasks.** `filterFor` translates a dock
  section into a `Partial<QueryState>` and `BaseTaskView.applyFilter` applies it, per bucket and per
  person — the hand-off keeps the list you were looking at.
- `Docs/ROADMAP.md`: the phases, the settled decisions, the design language, and the traps this
  project has already fallen into.
- The settings tab shows the loaded version, because Obsidian only re-reads `main.js` when the
  plugin is re-enabled.

## Unreleased

### Added — the focus view

- The sidebar is now a focus view with **one question and three slots**. Same view id, so an
  existing workspace layout keeps working.
- **Two provenances in "Avui", and they look different.** Tasks that arrive on their own — dated
  today, `🔺`, or `#urgent` — carry a terracotta rule, come first, and **never occupy one of your
  three slots**. The ones you pick carry a lila 1·2·3. This was the hole in the first design:
  with a hand-picked "today" only, something genuinely urgent could sit unseen in the pool.
- **The day's plan is not written to the notes.** `DaySelection` keeps it in the plugin's own data,
  stamped with the day; at midnight the stamp no longer matches and the plan is gone, so an
  unfinished task returns to the pool instead of becoming overdue. Writing `📅 avui` would have
  created exactly the debt that left twenty tasks rotting for up to five weeks. Identity is
  `note|text`, not `path:line`, because line numbers shift the moment you type a line above.
- **Two lenses over the same list**, "Per data" and "Amb qui", with a FLIP transition over real
  geometry — measure, rebuild, invert, play — so rows move rather than blink. Real geometry
  because a task's text wraps to two or three lines in a 300px dock. Honours
  `prefers-reduced-motion`.
- Sections are collapsible, remembered between sessions, and are `<button>`s with `aria-expanded`
  rather than divs with a click handler.
- Keyboard for the whole cycle: `J`/`K` move, `A` today, `D` date, `N` no, `X` done, `O` open,
  `/` search. Rows are focusable with a visible focus ring.
- Search is hidden until you ask for it (`/` or the magnifier), so the view shows data at rest.
- `Focus.ts` holds the section logic as a pure function, so the unit tests and the vault audit see
  exactly what the view renders. New audit assertion: every open commitment lands in exactly one
  section, no duplicates.
- 19 tests. Measured on the real vault: 0 urgent · 23 to renegotiate · 12 undated · 4 later.

### Removed

- **Priority is gone from the interface** — the row chip, the five menu entries and the sort
  option. Not one open task in this vault carries a priority marker, so it was pure visual weight
  with no signal. `TaskActions.setPriority` and the data model keep it.

### Added — the note as context

- `NoteContext` now reads `data`, `Persones`, `tipus`, `title` and `tags` from the host note's
  frontmatter, not just `Projecte` and `Àrea`. The 42 open tasks live in 24 notes and all 24 have
  frontmatter; the plugin was using two keys out of fourteen, and the one it insisted on
  (`Projecte`) is the one that is usually empty.
- `Task` gains `people`, `noteTitle`, `noteType`, `noteDate` and `kind`.
- The effective date falls back to the note's own `data:`, **but only for notes whose tags or
  `tipus` are listed in `deadlineFromNotes`** (periodic notes by default). A task written down in
  a meeting on 27 July is not late since 27 July; applying `data:` everywhere would have taken
  overdue from 20 to 35 and emptied "undated" of anything real. Measured effect: the three tasks
  in `Diari setmana 29 de 2026`, which the filename format cannot parse, stopped being undated
  (overdue 20 → 23, undated 18 → 15).
- `ageInDays` does use `noteDate` regardless, which is what "jotted down five weeks ago" needs.
- `TaskKind`: `documentacio` notes make their checklists `reference` — kept, never deleted, but
  out of `bucketCounts` and out of the default query. Three template lines in
  `CLAUDE - Plantilla equip.md` were being counted as open tasks. `somedayNoteTypes` is empty by
  default; add `idea` to move strategic intentions out of the daily pool.
- Group and filter by person (`GroupKey: "person"`, `QueryState.person`, `countByPerson`). A task
  in a note naming two people appears under both, ordered by how much you owe each person.
- `Frontmatter.ts`: a narrow frontmatter reader used only when Obsidian's parsed frontmatter is
  absent, so the vault audit test can verify all of the above against the real vault.
- Three new settings, all editable lists: `deadlineFromNotes`, `referenceNoteTypes`,
  `somedayNoteTypes`.
- 24 tests, plus four new audit assertions on the real vault: weekly notes resolve a date,
  meetings do not lend theirs, documentation is classified and excluded from the counts, and
  every person resolves to a clean name.

### Added — undo

- `History`: a 50-entry ring of `WriteRecord`s (`{ path, line, before, after }`). Reuses what
  the conflict guard already knew, so recording costs nothing.
- `TaskWriter.undo()`: reverses the newest entry under the same conflict guard as a forward
  write. Records are replayed ascending, which rebuilds the original line numbering as it goes,
  so a multi-line deletion across several files restores byte-for-byte.
- `TaskActions.beginGroup` / `endGroup`: a bulk action of twenty writes is one undo step.
- Command `Desfés l'últim canvi del plugin`, hidden when there is nothing to undo. No default
  hotkey on purpose: `Mod+Z` belongs to the editor.
- `undoableNotice`: destructive actions (delete, bulk delete, cancel, empty-task cleaning) show
  a **Desfés** button inside the notice.
- 13 tests, including the two cases that make undo trustworthy rather than plausible: a line
  edited by hand after the write is refused, and a deleted line retyped by hand is not
  duplicated.

### Changed

- `autoDeleteEmptyTasks` now defaults to **off**. It was the only path that wrote to notes
  without being asked, with no trace; on an iCloud-synced vault that has to be opt-in.
- The bulk-delete confirmation no longer says the deletion cannot be undone, because it can.

### Added

- Task index over the whole vault, markdown-only source of truth, one parsing path shared
  with the audit test (`buildTasks.tasksFromFile`).
- `TaskParser` reading Tasks-compatible emoji fields from the end of the line, recording
  offset spans so edits never rebuild a line from a model.
- `TaskLineEditor`: surgical set/remove of a field and status, canonical insertion order.
- Effective-date rule (`due ?? scheduled ?? start ?? filenameDate`) and the exhaustive
  bucket partition (overdue / today / week / later / undated / closed).
- `FilenameDate` replicating the Tasks plugin's filename-as-scheduled-date setting; bails
  out on unsupported moment tokens instead of guessing.
- `TasksPluginSettings`: statuses and behaviour flags read from the Tasks plugin's own
  `data.json`, with safe fallbacks.
- `ScopeFilter` blacklist, seeded from Obsidian's `userIgnoreFilters`.
- `TaskWriter`: single-line writes through `vault.process`, abandoned on conflict.
- `TaskActions` quick actions; recurring tasks are deliberately not completed by the plugin.
- Sidebar view: five health pills with live counts (overdue / today / week / undated /
  stale), each a one-click filter, plus search, sort and a clear-filters button.
- Triage view: multi-select with bulk reschedule (today, tomorrow, +1 week, Friday, clear
  date, cancel), grouping, project filter and named saved views.
- Settings tab and overdue ribbon badge.
- 91 tests, including a real-vault audit that pins the measured counts and proves every
  open task can be rescheduled without collateral damage.

### Fixed

- List-item detection accepts any Unicode whitespace as indentation, plus blockquote
  prefixes and numbered lists. A task in `03 Projectes/IA` indented with four EM SPACEs
  (U+2003) was being dropped by a `[ \t]*` pattern while the Tasks plugin saw it fine.

### Added — deletion

- `Eliminar la tasca` in the row menu removes the whole line.
- Bulk delete of the triage selection, behind a confirmation dialog.
- `TaskWriter.deleteMany`: groups by file, one `vault.process` per file, lines removed
  bottom-up so queued deletions in the same note keep valid line numbers.
- Auto-deletion of empty tasks (`- [ ]` with no text, tags, links or fields beyond `➕`).
  Runs on index rebuild, after a note changes, and when a note loses focus. Never touches
  the active note, and never an empty task that owns subtasks. Setting:
  *Eliminar automàticament les tasques buides* (on by default). Command:
  `Eliminar les tasques buides ara`.
- Empty tasks are filtered out of every view and every count, so a placeholder in the note
  you are editing does not show up as "(sense descripció)".

### Changed

- The real-vault audit test asserts invariants instead of pinned counts. Freezing counts of
  a live working vault failed the first day it was used for real; the invariant that
  actually matters is that the parser drops or mangles nothing, now checked by comparing
  against a deliberately looser pattern.

### Known limitations

- Recurring (`🔁`) tasks must be completed from the note so Tasks generates the next one.
- No mobile-specific layout.
- Existing ` ```tasks ` query blocks are neither read nor rewritten.
