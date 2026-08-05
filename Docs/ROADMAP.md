# Roadmap

Where the plugin is, what was decided and why, and what the next two phases are. Written so a
new session can pick up phase 4 without re-deriving any of it.

Current version: **0.2.2**. The plugin's settings tab shows the version actually loaded —
Obsidian only re-reads `main.js` when the plugin is re-enabled, so "I pressed ⌘R" and "the new
code is running" are not the same claim.

## Where the numbers come from

Every claim below is measured by `npm run audit:vault`, which runs the real pipeline over the
real vault and prints two lines: the raw counts and *what the views actually show* (they differ —
documentation checklists are excluded).

```
865 notes · 474 task lines · 40 open · overdue 18 · today 0 · week 2 · later 5 · undated 15
reference 3 · someday 0 · people Armando, Carmen, Dani Barreiro, Mireia, Mónica, Oscar Fafián, Xoel
shown to the user: overdue 18 · today 0 · week 2 · later 5 · undated 12
```

Two of those numbers shaped the whole design: **today was 0 and this week was 0** for weeks, while
overdue sat at 20–23 with ages up to 37 days. The plugin's most prominent counters were
structurally empty, and the overdue list was not a list of failures — it was a list of decisions
never made. Meanwhile **434 tasks have been closed since December and not one has ever been
cancelled**: at 404 with `✅` and 0 with `❌`, saying "no" effectively did not exist.

## Done

| | What | Notes |
|---|---|---|
| **Undo** | `History` ring of 50, `TaskWriter.undo()`, `Desfés` inside the notice | Reuses the previous line text the conflict guard already had |
| | `autoDeleteEmptyTasks` → **off by default** | The only path that wrote to notes unasked |
| **Phase 1** | The note's frontmatter as context | `data`, `Persones`, `tipus`, `title`, `tags` |
| **Phase 2** | The focus view (`SidebarView`) | Three slots, urgency, two lenses, keyboard, FLIP transition |
| | Priority removed from the UI | Not one open task in this vault has a priority marker |

## Phase 3 — dates in natural language

The remaining half of "renegotiate". Today the **Data** menu offers six fixed options (Demà,
Divendres, Dilluns que ve, +1 setmana, +1 mes, Treure la data). Anything else — "15 September" —
means opening the note and typing `📅 2026-09-15` by hand.

A pure parser (like `Focus.ts`, so it is testable without a DOM) plus a small input:

| Typed | Means |
|---|---|
| `dv`, `divendres` | next Friday |
| `dl que ve` | Monday of next week |
| `3d`, `+3` | in three days |
| `2s` | in two weeks |
| `15/9`, `15 set` | 15 September of the current year |

With the matches listed under the field as you type and `↵` accepting the first. `D` opens it.

Half a day, low risk, no new writes to the vault beyond the `📅` the plugin already writes.

## Phase 4 — the control centre

`TriageView` is still the original: six permanent dropdowns, a double checkbox per row, four
icons per row. It looks nothing like what was agreed, and it occupies two thirds of the window.
The design is mocked up in [mockups/04-centre-de-control.html](mockups/04-centre-de-control.html).

**Two roles, not two lists.** The dock answers *what do I do now*; this tab answers *how is the
system doing*. No control is duplicated between them — search, sort and filters currently exist
in both.

1. **KPI strip** — 40 open (in 24 notes) · 18 to renegotiate (oldest 37 days) · 12 undated
   (3 classifiable by frontmatter) · **2.5 closed per working day** (404 with `✅` since December).
   That last one is why the focus view has three slots and not ten: it is measured capacity.
2. **Throughput chart** — closed per month, real numbers: gen 73 · febr 80 · març 51 · abr 30 ·
   maig 35 · juny 73 · jul 33 · ag 20.
3. **Filters as chips, not dropdowns** — the active filter reads as a sentence ("obertes · per
   renegociar · és una tasca"), clears with an ×, and at rest the bar is nearly empty. `+ filtre`
   opens the full list when wanted.
4. **Detailed sortable table** — Tasca · Termini · Amb qui · Àrea · Origen · Accions.
5. **Health panel** — three concrete things to fix, each with its own action:
   - *No task cancelled in 8 months* (434 closed, 404 `✅`, 0 `❌`) → renegotiate them one by one.
   - *3 template lines counted as tasks* in `CLAUDE - Plantilla equip.md` (`tipus: documentacio`).
   - *12 notes with open tasks and no `Projecte`* → assign it in one click.
6. Same lens switcher as the dock (Per data / Amb qui / Per àrea).

Reuse `Focus.ts` and `Query.ts`; nothing new is needed in the index.

## Not scheduled

- **Mobile layout.** `isDesktopOnly: false`, so the plugin loads on the iPhone, where a 5-column
  grid and 22px targets do not work. Either a mobile layer (one column, 44px targets, swipe) or
  mark it desktop-only honestly.
- **Virtualised rendering.** The list is rebuilt on every change. Fine at 474 lines; the focus
  view's 5-row cap removed the immediate pressure.
- **Publishing to the community store.** Deliberately out of scope: the plugin's value is that it
  is calibrated to one vault's conventions. i18n would divert effort from what makes it useful.
- **Recurring tasks.** Completing a `🔁` task is left to the Tasks plugin. One such task exists.

## Decisions that are settled — do not re-litigate

**`data:` is a deadline only for periodic notes.** `deadlineFromNotes` defaults to
`["Nota_Diaria", "Nota_Setmanal"]`. A task written in a meeting on 27 July is not late since
27 July. Applying `data:` everywhere would have moved 15 of 18 undated tasks into overdue
(20 → 35). The meeting date *is* used for age.

**A task appears under every person in `Persones:`.** Per-person counts therefore add up to more
than the task count, and the view says so.

**`tipus` is configurable; `documentacio` is excluded by default.** `somedayNoteTypes` is empty —
add `idea` to move strategic intentions out of the daily pool. Nothing is ever deleted: excluded
lines stay in the note and out of the counts.

**The day's plan is never written to the notes.** It lives in `settings.dayPlan`, stamped with the
day. At midnight the stamp stops matching and the plan is gone, so an unfinished task returns to
the pool instead of becoming overdue — writing `📅 avui` would recreate the very debt that left
twenty tasks rotting for five weeks. Identity is `note|text`, not `path:line`, because line
numbers shift as soon as you type a line above.

**Urgency arrives on its own and never takes a slot.** Dated today, `🔺`, or `#urgent`: terracotta
rule, first in the list, and the three slots stay yours.

**Discarding costs one deliberate step more than postponing.** "No ho faré" lives at the bottom of
the date menu with a warning style, not as a word in the row, and there is no bare keyboard
shortcut for it. It cancels the line (`- [-]` plus `❌ date`) — it never deletes anything — and it
is undoable.

## The design language

- **A dense typographic list.** No cards, no borders, no avatars, no shadows: text hierarchy and
  one hairline per section. Background only on hover.
- **Three accents, one job each.** `--tcf-lila` what you chose (active lens, the 1·2·3, links) ·
  `--tcf-terra` what arrived on its own · `--tcf-ocre` age, **as text colour only** — twenty rows
  carry it and as a filled badge the list reads as a traffic light. No success green, no error red:
  an overdue task is not an error.
- **Never a bare `<button>` for something that is not a button**, and reach for Obsidian's own
  classes when the look should be native. The platform reasons, the symptoms and the rest of the
  rendering rules are in [ARCHITECTURE.md](ARCHITECTURE.md#rendering-inside-obsidian).
- **One piece of context per row.** The person if the note names one, otherwise the origin. The
  rest — other people, full path, exact date — goes in the tooltip.
- **Five rows per section**, then a quiet "N més" that hands over to the control centre. The dock
  is where you decide what to do next, not where you audit the backlog.
- **Actions only on the row you are on.** Three words across twenty rows was sixty clickable
  things competing with the tasks. The key hints at the bottom keep them discoverable.
- **Air instead of rules.** Nothing separates two rows but space.

"It stresses me, everything is too tight" was the most useful piece of feedback in the whole
redesign, and none of it was fixed by polish. Every answer was a **removal**: five rows instead of
twenty-three, two action words instead of three, actions only on the active row, one context
fragment instead of four, no hairlines. When density is the complaint, adding refinement makes it
worse.

## The traps this project has already fallen into

1. **Pinning a count from a live vault in a test.** It happened twice: once with the bucket counts,
   once with `expect(weekly.length).toBeGreaterThan(0)` — which passed the day it was written and
   failed the moment the weekly notes were emptied for real. Assert invariants; add a synthetic
   case when the rule needs data that may not exist.
2. **Styling something Obsidian already styles.** See `<button>` above.
3. **Assuming a deploy is a reload.** `styles.css` is picked up live, `main.js` is not. New CSS on
   old JS produced a screenshot that looked like nothing had changed. Bump the version on every
   visible change and read it back from the settings tab.
4. **Counting emoji with a character class.** `/[🔺⏫🔼🔽⏬]/` without the `u` flag matches the
   *surrogate halves*, so it also matches `📅`. It reported 28 tasks with a priority when the real
   answer is zero, and that wrong number was used to justify keeping the priority UI.
5. **Overwriting a class that is also a query hook.** `lead.className = "ord"` erased the `.lead`
   the next paint looked for; `paint()` threw before it swapped the list, so the lens button did
   nothing and the animation never ran — with no visible error anywhere. Symptom to recognise: a
   control that silently does nothing usually means the render threw halfway, leaving the previous
   DOM in place.
6. **Explaining away a screenshot instead of diagnosing it.** Faced with "it still looks wrong", the
   deduction "your screenshot must be stale" was made from a single detail and was wrong. Cheap
   diagnostics that would have settled it in one step: grep the *deployed* bundle for the new
   markers, list every copy of the plugin on disk, check which vault Obsidian actually has open,
   and put the loaded version in the settings tab.
