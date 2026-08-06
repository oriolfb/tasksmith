# Changelog

## Unreleased — the week ahead, and five things that did not work

### Added

- **The control centre shows the week, not the year.** Where the throughput bars were, there is now
  one column per day for the next seven days: how many tasks carry that date, today first. Rolling
  and not Monday-to-Sunday, because on a Thursday a calendar week answers "what is coming at me"
  with three days. Clicking a column filters the table to exactly that day — a new `dueOn` filter,
  since "dijous" is neither the `today` bucket nor the `week` one. Either side of the seven columns
  sit the three counts they leave out (before today, later, undated), so the strip cannot mislead by
  omission, and a day loaded past the measured `tancades/dia laborable` is marked: six tasks on a day
  that closes two and a half is not a plan, it is three tasks that will become overdue.
- **The weekend can be switched off, and nothing goes missing with it.** A setting decides whether
  Saturday and Sunday get a column. Off, the strip runs over seven *working* days — so it reaches
  nine or ten days into the future — and a task dated on a weekend is counted in the Monday that
  follows it. Folded, never dropped: the column's tooltip says how many of its tasks are really the
  weekend's, the foot of its bar draws them in a second tone, and clicking it opens all three dates
  rather than just the Monday. That last part is why `dueOn` holds a list of days instead of one: a
  number you can click has to open exactly what it counted. Today keeps its column even when today
  is a Saturday — it is the day you are standing on.
- **Created against closed, per month — folded away.** The history the old chart told is still there
  under **Historial**, now with both series: what came in and what went out, plus how much of each
  month's intake is still open. Closed by default and remembered, because a backlog trend is worth
  looking at now and then and never worth looking at while deciding what to do this afternoon.
  "Created" is the line's own `➕` or, failing that, the date of the note it lives in — 19 of 461
  lines carry a `➕`, so the fallback is the difference between a chart and no chart. The caption
  says so rather than letting the bars imply a precision they do not have.

- **The health panel folds.** Its title is now a toggle, like the history's, with the number of
  things worth looking at on the line when it is folded. The default is a rule rather than a
  boolean — `healthPanel: "auto"` — because the honest answer depends on where the panel is: as the
  right-hand rail it costs nothing and stays open, stacked on a narrow tab it starts folded and
  moves *above* the table, one line and one click instead of thirty rows of scrolling away. Folding
  it by hand outranks the rule from then on, at any width. Whether the layout is stacked is asked of
  `getComputedStyle`, not of a second copy of the 780px breakpoint that could drift from the CSS.

### Fixed

- **Pressing "Avui" on a task that already carries today's date does something.** Urgency used to
  win over choosing, so a task dated today stayed in the urgent list, never took a number and never
  moved the counter off "0 de 3" — the button looked broken. Choosing now wins: the task moves to
  your three, takes its ordinal and holds a slot. The terracotta "arrived on its own" mark and the
  "data d'avui" line are now decided per row rather than per section, so a task you picked for next
  week no longer reads as urgent because an urgent one sits above it.
- **"Planificar el dia" plans the day.** It only revealed the dock, and the dock is normally already
  open, so the button appeared to do nothing. It now puts the view in the state planning needs —
  date lens, search cleared, "Avui" unfolded, list scrolled to the top, keyboard already on the
  first row — and the section flashes once so the eye lands where the decision is.
- **"Aquesta setmana" includes today.** The `week` bucket runs from tomorrow to Sunday, and the
  filter that carried its name hid exactly the tasks you were looking for. The menu entry now asks
  for `today + week`; the bare bucket is called "d'aquí a diumenge", which is what it is.
- **The health panel no longer squeezes the tasks out of the tab.** Stacked under the table on a
  narrow tab, the table was the only box that could shrink — down to two visible rows while the
  panel kept its full height. The table now keeps its content height and the whole column scrolls.
- **The task name is readable.** The columns are measured against the *table's* width rather than
  the tab's, so the health rail's 270px are no longer counted as room the columns have — that is
  what left descriptions at "Ge…". The name keeps a real minimum width, normal colour, a little more
  weight than the columns around it, and wraps to two lines instead of ellipsing on the first.
- **The vault is scanned in 168 ms instead of 2.4 s.** The full scan read its 895 notes one at a
  time — an `await` per file, 895 round-trips taken in single file — and the measurement says the
  parser was never the cost: reading is 2,392 ms sequentially and 168 ms in batches of 32, while
  parsing all 508 tasks is 32 ms. Those are warm-cache numbers on a local disk; on a cold start,
  over iCloud, competing with Obsidian's own indexing, it is the difference you actually noticed. The
  scan now reads in batches and swaps the finished index in whole rather than emptying the old one
  first, so a re-scan after a settings change shows the previous tasks rather than none.
- **The day's three no longer vanish overnight.** Every Obsidian start wiped the plan, and this is
  why: the dock paints before the first scan has finished, and reconciling the plan against the index
  at that moment asked "do these tasks still exist?" of an index that had not been read yet. Nothing
  existed, so the plan was emptied — and written back to disk, which made the loss permanent. An
  index that is still loading is now distinguished from a vault with nothing in it: the dock waits for
  `index.ready`, and the reconciliation itself refuses to run against an empty list. The slow scan
  above is what made this near-certain rather than occasional; both are fixed, but either alone would
  have left the bug reachable.

## 0.4.0 — TaskSmith, and the shape a community plugin is supposed to have

### Changed

- **The plugin is called TaskSmith.** The id is `task-smith`, so it lives in a new folder inside
  the vault; the two view ids became `task-smith-sidebar` and `task-smith-triage`. That is the one
  moment a rename is cheap — before a first release, while the only installation is Oriol's own,
  which `scripts/migrate-id.mjs` moves across in one go (settings, the enabled list, the saved
  layout). After a release an id is API and this door closes. `TASK_CONSOLE_VAULT` is now
  `TASK_SMITH_VAULT`.
- **The Tasks plugin's `data.json` and Obsidian's `app.json` are read through `vault.configDir`.**
  `.obsidian` is only the default name of the config folder; a vault that renamed it was getting
  built-in defaults instead of the real status set, silently. `TASKS_PLUGIN_DATA` is now relative to
  the config folder rather than to the vault root.
- **`Logger.info` writes to `console.debug`.** A rebuild happens on every save, and Obsidian's
  guidelines ask a plugin not to fill the console with routine chatter. Warnings and errors are
  unchanged — those are worth interrupting for.

### Added — the sample plugin's scaffolding, which was missing

Measured against [obsidian-sample-plugin](https://github.com/obsidianmd/obsidian-sample-plugin):

- **`versions.json` + `version-bump.mjs` + `npm version`**, so a release is one command and older
  Obsidian versions can still resolve a compatible build. `.npmrc` drops the `v` from the tag, which
  is what the community catalogue expects.
- **Two GitHub workflows.** `lint.yml` builds, lints and runs the tests on Node 20/22/24 for every
  push; `release.yml` fires on a tag and opens a draft release with `main.js`, `manifest.json` and
  `styles.css` attached, with build provenance.
- **ESLint with `eslint-plugin-obsidianmd`.** It found the config-folder bug above and the console
  noise. Tests and the hand-written Obsidian mock get their own relaxed block: the audit's console
  output *is* its deliverable, and a mock is allowed to be `any`.
- **A `README.md` at the root and a `LICENSE` file.** Both are required to enter the catalogue, and
  `package.json` had been claiming MIT with no licence text to back it.
- **`tsconfig.json` aligned with the sample**: ES2021, `noImplicitReturns`,
  `noFallthroughCasesInSwitch`, `forceConsistentCasingInFileNames`, and the test files no longer
  excluded from type-checking — which immediately surfaced two of them building a `Task` that had
  been missing four fields since the note-context work.

## 0.3.1 — the day's record

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

- **"N més" hands off to the control centre, filtered to the same tasks.** Clicking the overflow
  link under a dock section now opens the wide view already scoped to it — the same person, or the
  same date bucket — instead of landing on the unfiltered list. `BaseTaskView.applyFilter` merges a
  partial `QueryState` into the view and refreshes; `SidebarView.filterFor` maps each section key to
  its equivalent filter.
- Two more platform facts in `ARCHITECTURE.md`'s **Rendering inside Obsidian**, both learnt while
  building the control centre. `MenuItem.setSubmenu` is not in the public typings even though the
  app uses submenus, so `+ filtre` reaches for `FuzzySuggestModal` (`PickModal`) and for
  `setIsLabel(true)` instead of an undocumented call that would fail silently. And sizes CSS cannot
  resolve are computed in the view: a percentage bar height inside a flex column resolves against a
  box its own labels share, and the faded bars use `opacity` rather than `color-mix`, because
  `minAppVersion` makes the plugin's floor the app's Chromium rather than the machine's.

## 0.3.0 — the control centre

### Added — the wide view is now a panel, not a second list

- **The triage tab is the control centre.** Same view id and same command id, so an existing
  workspace layout and an existing hotkey keep working. The dock answers *what do I do now*; this
  tab answers *how is the system doing*, and no control is duplicated between them.
- **A KPI strip of four measured numbers**: open (and how many notes they live in), to renegotiate
  (with the age of the oldest), undated (and how many of those have a date sitting in their note's
  frontmatter), and **closings per working day**. The last one is the measured capacity the focus
  view's three slots come from. Each figure is a one-click filter, and the strip describes the
  **vault, not the filter** — a strip that moved with every chip would answer nothing.
- **A throughput strip**: closed per month over eight months, split into ✅ and ❌ in the tooltip,
  with the month in progress marked so the 5th of August does not read as a collapse.
- **Filters as chips instead of six permanent dropdowns.** The bar reads as a sentence — "obertes ·
  per renegociar · és una tasca (no documentació)" — each chip clears itself, and `+ filtre` opens
  the rest. The two filters that are on by default are chips too, so they are visible and can be
  switched off; the exclusion chip only appears in a vault that actually holds such lines.
- **A sortable table**: Tasca · Termini · Amb qui · Àrea · Origen · Accions. Click a column to sort
  by it, click it again to turn it around. One checkbox per row for the bulk actions and the row's
  own actions as words — the row this replaces had a select checkbox *and* a status button *and*
  four icon buttons.
- **A health panel that acts, not a wall of statistics.** Each finding names one thing and the one
  action that fixes it: never having cancelled anything in eight months → renegotiate them one by
  one; tasks whose note carries a date the plugin deliberately does not treat as a deadline → put
  that date on them (guarded, one undo step, and it asks first, because it writes to several notes);
  notes with open tasks and no `Projecte` → see them; tasks stale past the threshold → see them.
  The documentation lines and the index line read as the system working rather than as a problem.
- The same three lenses as the dock (Per data / Amb qui / Per àrea), `Planificar el dia` back to the
  dock, and the keyboard from the dock plus `Espai` to select.
- Saved views moved into a menu behind one icon. Nothing was lost; at rest the bar shows data.
- `Metrics.ts`, `Health.ts` and `Filters.ts` are **pure**, like `Focus.ts`: the vault audit runs
  them over the real vault, so the panel's figures and the figures CI prints cannot drift apart.
  43 new unit tests (215 in total), plus two audit assertions — the KPI strip has to agree with
  `bucketCounts` about what is open, and every finding has to be able to act on something real. On the
  real vault: 33 open in 23 notes · 14 to renegotiate (oldest 37 days) · 12 undated, all 12 with a
  date in their note · 2.3 closed per working day · 428 with ✅ and **0 with ❌**.

### Changed

- `DateMenu.ts` holds the date menu both views open. It was duplicated, and what sits at the bottom
  of it — "No ho faré", separated and marked as a warning — is a rule worth exactly as much as the
  number of places that implement it.
- `sortTasks` takes a direction, and `SortKey` gains `text`, `person` and `area` for the table's
  columns. A row with nothing in the sorted column goes last whichever way the column points.
- `BaseTaskView` no longer owns a renderer: it owns the query, the index subscription and the
  coalesced refresh, and the view decides how the result is drawn.

### Removed

- The old triage view, its row renderer, and **370 lines of stylesheet** that styled five health
  pills, a double checkbox and four icon buttons per row. Every answer in this redesign has been a
  removal.

### Fixed

- `container-type: inline-size` on the control centre's root means its width can no longer come
  from its contents — without an explicit `width: 100%` the whole tab collapsed to a 30px column
  wherever the parent sized to content. Caught by the new render harness, not by a screenshot.
- The table's "Accions" heading was invisible: the header cell and the row's hover-only action
  container shared one class, so the heading inherited `opacity: 0`. Same shape of mistake as
  `lead.className = "ord"`, and the second time this project has made it — the column class and
  the state class are now separate.

### Added — documentation

- [`mockups/07-centre-real.html`](mockups/07-centre-real.html): the control centre's real DOM
  against the real `styles.css`, at full width and at a 660px split, with Obsidian's own button
  styling left switched on so a regression to grey chrome is visible. It found both bugs above.
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
