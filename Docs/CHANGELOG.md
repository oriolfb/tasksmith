# Changelog

## Unreleased

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
