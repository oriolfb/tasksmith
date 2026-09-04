# Roadmap

Where the plugin is, what was decided and why, and what is left. Written so a new session can pick
up the next phase without re-deriving any of it.

Current version: **0.5.3**. The plugin's settings tab shows the version actually loaded —
Obsidian only re-reads `main.js` when the plugin is re-enabled, so "I pressed ⌘R" and "the new
code is running" are not the same claim.

## Where the numbers come from

Every claim below is measured by `npm run audit:vault`, which runs the real pipeline over the
real vault and prints the raw counts, *what the views actually show* (they differ — documentation
checklists are excluded), and the two strips the control centre draws.

```
867 notes · 474 task lines · 35 open · overdue 13 · today 0 · week 2 · later 5 · undated 15
reference 3 · someday 0 · people Armando, Carmen, Dani Barreiro, Mireia, Mónica, Oscar Fafián, Xoel
shown to the user: overdue 13 · today 0 · week 2 · later 5 · undated 12
centre de control: 32 obertes en 22 notes · 13 per renegociar (la més antiga fa 37 dies) ·
12 sense data (12 amb data a la nota) · 2,3 tancades/dia laborable (429 amb ✅, 0 amb ❌)
creades/tancades per mes: 01 83/73 · 02 63/80 · 03 45/51 · 04 59/30 · 05 34/34 · 06 58/65 ·
07 58/33 · 08 3/25
la setmana: 08-05 0 · 08-06 2 · 08-07 0 · 08-08 0 · 08-09 0 · 08-10 0 · 08-11 0 ·
abans d'avui 13 · més enllà 5 · sense data 12
```

Two of those numbers shaped the whole design: **today was 0 and this week was 0** for weeks, while
overdue sat at 14–23 with ages up to 37 days. The plugin's most prominent counters were
structurally empty, and the overdue list was not a list of failures — it was a list of decisions
never made. Meanwhile **428 tasks have been closed since December and not one has ever been
cancelled**: at 428 with `✅` and 0 with `❌`, saying "no" effectively did not exist. That number is
now a finding in the control centre's health panel rather than a line in this document.

**The backlog is not a throughput problem.** Over eight months the vault took in 403 tasks and
closed 391 — near enough balanced that "close more" was never the fix. The pile comes from two
months where intake nearly doubled output, April (59 in, 30 out) and July (58/33), and it has never
been paid back since. This is the reading the old chart could not give: closings per month alone
made July look like a slow month rather than a month that took on 58 new commitments.

**Two of 32 open tasks fall in the next seven days.** The week strip is mostly zeros, and the
zeros are the finding: work in this vault becomes visible when it is already late, not when it is
scheduled. Thirteen sit before today, twelve carry no date at all, five are further out than the
strip reaches. A strip that stayed empty every morning would be a strip worth deleting — what makes
it worth keeping is that the three counts beside it say where everything went instead.

## Done

| | What | Notes |
|---|---|---|
| **Undo** | `History` ring of 50, `TaskWriter.undo()`, `Desfés` inside the notice | Reuses the previous line text the conflict guard already had |
| | `autoDeleteEmptyTasks` → **off by default** | The only path that wrote to notes unasked |
| **Phase 1** | The note's frontmatter as context | `data`, `Persones`, `tipus`, `title`, `tags` |
| **Phase 2** | The focus view (`SidebarView`) | Three slots, urgency, two lenses, keyboard, FLIP transition |
| | Priority removed from the UI | Not one open task in this vault has a priority marker |
| **Phase 3** | Dates in words (`DateInput` + `DateInputModal`) | One pure parser, one field inside the date menu both views share |
| **Phase 4** | The control centre (`ControlCentreView`) | KPI strip, throughput, filter chips, sortable table, health panel |
| | The week ahead, and the history folded away | Seven day columns and a `dueOn` filter took the permanent slot; created-against-closed per month moved behind **Historial** |
| | The old triage view and 370 lines of CSS | Deleted with the markup that used them |

## Phase 3 — dates in natural language (done, 0.5.0)

The remaining half of "renegotiate", and the one thing the control centre could not give you: the
table lets you sort twenty overdue tasks by age and act on each, but "15 September" meant opening
the note. Both views open the same menu (`DateMenu.ts`), so the field landed in one place and both
got it at once — **Escriure una data…**, last of the postponements, above "Treure la data".

`DateInput.parseDateInput(text, today)` is pure like `Focus.ts` and reads:

| Typed | Means |
|---|---|
| `avui`, `dema`, `dema passat` | today, tomorrow, the day after |
| `dv`, `divendres` | the next Friday — never today, so `dc` on a Wednesday is next week's |
| `dv que ve`, `divendres vinent` | Friday of next week, Monday-based |
| `3d`, `+3`, `3 dies`, `3` | in three days |
| `2s`, `2 setmanes` | in two weeks |
| `1m`, `2 mesos` | calendar months, clamped: one month after 31 January is 28 February |
| `15/9`, `15-9`, `15.9`, `15/9/27` | day, month, and a year if you give one |
| `15 set`, `15 setembre`, `15 de març` | by name, from a prefix of it |
| `2026-09-15` | as it stands |

Every match says what it means (*Divendres que ve*, *En 3 dies*, *15 de setembre de 2026*) and the
day it lands on, and `↵` takes the first. Case and accents are ignored — `marc` is `març`.

Four decisions, all of them about not guessing:

- **An input it cannot read returns nothing**, and an ambiguous one returns every reading it has.
  `15 ma` lists March and May; `15/3` in August lists this year's — as written — and next year's
  under it, because both are real and picking one silently is wrong half the time. What makes a list
  affordable is that each row shows its date: `dg. 15 març · fa 5 mesos` is not something you accept
  by accident, which is why the age is printed for a day already gone and for nothing else.
- **`set` is not a unit for weeks.** It is September's abbreviation, and `15 set` has to be the
  fifteenth. Weeks are `s`/`setmana`/`setmanes`, and matching against the *full* month name is what
  keeps `setmanes` from reading as `setembre`. One table in `format.ts` with two readers — the views
  print the abbreviation, the parser matches the full name.
- **The empty field offers what the menu offers**, in the menu's order, so opening it without a
  phrase in mind is not a dead end. Two readings landing on the same day are one offer: on a Friday
  *divendres* and *+1 setmana* are the same date.
- **It only writes `📅`.** Clearing the date stays a separate item in the menu below, so dismissing
  the field means "never mind", not "remove the date".

The field is a `SuggestModal`, not a text input of our own, for the same reason `PickModal` is —
the public API already has a keyboard-first list that looks native. Building on that API is also
what turned up that `PickModal` had never worked: the modal closes *before* it says what was
chosen, so a promise resolved from `onClose` answered "cancelled" every time. Fixed in both, and
written down in [LLIÇONS.md](LLIÇONS.md#rendering-inside-obsidian).

With this the plan is built. What is left is in **Audit backlog** below, and nothing pending there
is committed to.

## Phase 4 — the control centre (done, 0.3.0)

`ControlCentreView` replaced `TriageView`, keeping the view id and the command id so layouts and
hotkeys survive. Six permanent dropdowns, a double checkbox and four icon buttons per row are gone.

**Two roles, not two lists.** The dock answers *what do I do now*; this tab answers *how is the
system doing*. Nothing is duplicated: the dock has the day's three slots and no table; the tab has
the numbers, the table and the health panel and no day plan.

1. **KPI strip** — open (and the notes they live in) · to renegotiate (with the oldest) · undated
   (and how many have a date in their note) · **closings per working day**, the measured capacity
   the three slots come from. Each figure filters the table in one click, and the strip always
   describes the vault, never the current filter.
2. **Week strip** — one column per day from today, what each day already carries, and beside them
   the three counts the seven days leave out. Clicking a column filters the table to it. The
   history it replaced — created against closed per month — is one click below, folded.
3. **Filter chips** — the bar reads as a sentence, each chip clears itself, `+ filtre` opens the
   rest. The two filters that are on by default are chips too, so they can be seen and switched off.
4. **Sortable table** — Tasca · Termini · Amb qui · Àrea · Origen · Accions; click a column again to
   turn it around. Columns drop (Àrea, Origen, then Amb qui) as the tab is split narrower, because
   all three are in the row's tooltips anyway.
5. **Health panel** — each finding names one thing and the one action that fixes it, computed from
   the vault rather than written down here. Today: no cancellation in 8 months → renegotiate them;
   12 undated tasks whose note has a date → put that date on them; 22 notes without `Projecte` → see
   them; 20 stale → see them. The documentation lines and the index line read as the system working.
6. Same three lenses as the dock, and `Planificar el dia` back to it.

Three decisions taken while building it, all of them narrowing the mockup:

- **The mockup's cards did not survive.** [mockups/04](mockups/04-centre-de-control.html) carries
  its own "superseded" banner for a reason: bordered KPI boxes and a card per finding are what made
  it read as a dashboard someone else built for you. The panel uses the same dense typographic
  language as the dock, and the real DOM is verified in
  [mockups/07-centre-real.html](mockups/07-centre-real.html).
- **"Assign `Projecte` in one click" was not built.** Every write this plugin makes is a single
  guarded, undoable line; writing frontmatter is a different kind of write, and the panel points at
  the notes instead. The one fix that does write — copying a note's own `data:` onto its undated
  tasks — is exactly the kind of write the plugin already does, and it asks first.
- **The health panel is not capped at three items.** It shows every finding, severity first. A
  silent "top 3" reads as "that is all there is".

## Audit backlog — 2026-09-04

This is the durable register of the productivity, UX, performance, security and engineering audit.
It includes completed work as well as deferred proposals so a later session does not have to
reconstruct the audit from conversation history. **P0** means correctness or data safety, **P1** a
high-value improvement, **P2** worthwhile after measurement or when distribution grows. A ⭐ marks
the recommendation that was selected as the first priority in each area.

| Area | Priority | Proposal | Expected effect | Status | Acceptance criteria |
|---|---:|---|---|---|---|
| Reliability / performance | ⭐ P0 | Serialize index rebuilds, coalesce overlapping requests and only publish the newest completed scan | Faster under bursts of vault events and immune to an older scan overwriting newer data | **Done in 0.5.3** | Concurrent rebuild tests prove one active scan and latest-request-wins publication |
| Data safety / UX | ⭐ P0 | Make undo robust when surrounding lines move after an action | Safer: undo restores the intended task instead of changing an unrelated line | **Done in 0.5.3** | Tests cover moved lines, neighbouring anchors and ambiguous matches; ambiguity performs no write |
| Compatibility / mobile | ⭐ P0 | State the real platform contract instead of presenting an unverified mobile experience | More predictable and safer to install: unsupported mobile use is blocked | **Done in 0.5.3** | `manifest.json` declares desktop-only until the mobile acceptance criteria below pass |
| Productivity / settings | ⭐ P1 | Debounce text settings and avoid a full index rebuild for visual-only changes | Faster configuration with fewer redundant vault scans | **Done in 0.5.3** | Rapid edits cause one save/rebuild; visual settings refresh views without scanning the vault |
| Privacy / storage | ⭐ P1 | Let the user disable the persistent task cache and reject malformed cached records | More private and robust: task text need not persist outside notes, and bad cache data cannot leak into the UI | **Done in 0.5.3** | Cache persistence is opt-in/out through settings and invalid dates/records are discarded by tests |
| Accessibility | ⭐ P1 | Give custom icon controls keyboard activation, focusability and accessible names | Easier and safer to use with keyboard and assistive technology | **Partly done in 0.5.3** | Every interactive control is reachable in logical order, works with Enter/Space, exposes its state/name and has visible focus |
| Quality / testing | ⭐ P1 | Add lifecycle and DOM integration coverage around the index, settings and principal views | Fewer regressions in behaviours that pure-function tests cannot see | **Partly done in 0.5.3** | Tests cover listener registration/cleanup, settings debounce and rebuild policy, navigation, actions and ARIA state in `main.ts`, `SettingsTab`, `BaseTaskView`, `SidebarView` and `ControlCentreView` |
| Supply chain / releases | ⭐ P1 | Harden dependencies and release provenance | More secure and reproducible builds | **Partly done in 0.5.3** | Runtime packages are minimal and pinned, Dependabot is active, workflow permissions are least-privilege, Actions use full commit SHAs, and releases attest all distributed artifacts |
| Reliability / observability | P1 | Preserve the last known tasks when a note cannot be read and make partial scans visible | More trustworthy: one bad file does not silently erase tasks | **Base done in 0.5.3; UX pending** | Notice reports partial failure; control centre also lists affected paths, offers retry and clears the warning after a clean scan |
| Productivity / health | P1 | Turn health findings into a review workflow with fix, snooze and safe bulk actions | Faster backlog maintenance and fewer findings that remain indefinitely | **Proposed** | Each actionable finding has a next step; writes require confirmation where appropriate and are undoable; snoozed items return predictably |
| UX / onboarding | P1 if published | Add first-run configuration instead of assuming this vault's conventions | Easier adoption and fewer misleading results in a new vault | **Proposed; distribution-dependent** | Setup detects the Tasks plugin, explains data access, and configures excluded folders, note types, deadline sources and cache preference |
| Privacy / storage | P1 | Minimise the persistent cache schema, version it, expire stale entries and provide a purge action | More private, recoverable upgrades and less stale sensitive text on disk | **Proposed** | Cache stores only fields required for startup, has schema version + expiry, migrates or rejects old data, and can be erased from settings |
| Performance | P2 | Establish a synthetic large-vault benchmark before adding virtualised rendering | Measurably faster large-vault UI without speculative complexity | **Proposed** | Benchmark covers 5,000–10,000 tasks with documented scan/render budgets; virtualization is added only if a budget is exceeded |
| Performance | P2 | Compute vault-wide derived values once per rebuild and share them with task parsing | Faster scans with less repeated work | **Done in 0.5.3** | `knownPeople` is computed once per rebuild and covered by index tests |
| Maintainability | P2 | Split `ControlCentre.ts` into KPI, week, history, health, filter and bulk-action components | Easier and safer changes through smaller units with clearer ownership | **Proposed** | View orchestration contains no section implementation details; extracted units keep pure computations separate and retain behaviour tests |
| Maintainability / CSS | P2 | Partition the large stylesheet by view/component and remove dead selectors | Easier visual maintenance and a smaller risk of cross-view regressions | **Proposed** | Every selector has an owning component/view, dead rules are removed, and rendering snapshots/manual checks remain unchanged |
| Compatibility / API | P2 | Decide when to raise the minimum Obsidian version, then replace compatibility fallbacks and deprecated APIs | Cleaner code and fewer lint warnings without breaking current users | **Proposed** | Decision is recorded; either 1.6 compatibility stays documented or the minimum is raised and `getLanguage`, setting definitions, destructive styling and notice APIs are migrated |
| Repository hygiene | P2 | Keep generated `main.js` out of Git and verify release artifacts automatically | Cleaner reviews and fewer mismatches between source and shipped plugin | **Mostly done in 0.5.3** | `main.js` is ignored/untracked; CI fails on tracked generated bundles or version/artifact mismatch |
| Mobile UX | P2 | Build a deliberate mobile layer before enabling mobile support | Usable on small touch screens rather than merely installable | **Not scheduled** | One-column layouts, minimum 44 px targets, touch-native interactions and representative phone/tablet tests pass before `isDesktopOnly` changes |
| Publishing | P2 | Reassess community-store publication only after defaults and onboarding are vault-agnostic | Broader reach without exporting personal assumptions as product defaults | **Not scheduled** | Public defaults contain no vault-specific conventions, onboarding passes on a clean vault, documentation and support policy are ready |
| Recurring tasks | P2 | Define an explicit coexistence contract with the Tasks plugin | More predictable completion of `🔁` tasks and no duplicate recurrence logic | **Not scheduled** | Documentation and UI consistently delegate recurrence; integration test proves TaskSmith does not corrupt or duplicate a recurring task |

### Suggested order for pending work

1. Finish the accessibility audit and lifecycle/DOM integration coverage.
2. Complete cache minimisation and supply-chain SHA pinning.
3. Expose partial-scan details and turn health findings into a review workflow.
4. Refactor the control centre and CSS behind green tests.
5. Benchmark a large synthetic vault; virtualise only if the measurements justify it.
6. Treat onboarding, mobile and publication as one product-distribution decision, not three isolated features.

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

**Finishing frees the slot but keeps the line.** What you tick off in "Avui" stays at the foot of
the section, struck through, in `dayPlan.done` — the only closed tasks the focus view shows. A view
that empties itself as you work looks exactly like a view where nothing happened: three empty slots
at six in the evening, three at nine in the morning. The record dies at midnight with the plan, and
un-ticking the box hands the task back to a free slot.

**The scan reads concurrently and still persists nothing.** Measured on the real vault: 2,392 ms
reading 895 notes one `await` at a time, 168 ms in batches of 32, 32 ms to parse all 508 tasks.
The scan was never CPU-bound and it was never a caching problem — it was 895 round-trips taken in
single file. Batching removed the whole cost, so there is still no index on disk to go stale.

**Rejected: skipping notes that `metadataCache` says hold no list items.** Only 196 of the 895
notes contain a task line, so the filter would drop 78% of the reads — and it is not worth it.
Batching already put the scan at 168 ms, so the prefilter buys ~100 ms, and it buys them by making
the index trust Obsidian's list parser to register exactly the lines `TaskParser` goes out of its
way to accept: tasks inside blockquotes, EM SPACE indents, `1. [ ]`. Whether it does was never
verified, and the failure mode is a task that silently stops existing. In the one plugin whose
purpose is not to lose tasks, 100 ms does not buy that risk.

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
- **The same language holds in the wide view.** A table gets a grid instead of borders: one hairline
  under the header, air between rows, background on hover, and the deadline still ochre text rather
  than a badge. Numbers may be large — the KPI strip is the one place where they are the content —
  but they are not boxed.
- **Actions only on the row you are on.** Three words across twenty rows was sixty clickable
  things competing with the tasks. The key hints at the bottom keep them discoverable.
- **Air instead of rules.** Nothing separates two rows but space.

"It stresses me, everything is too tight" was the most useful piece of feedback in the whole
redesign, and none of it was fixed by polish. Every answer was a **removal**: five rows instead of
twenty-three, two action words instead of three, actions only on the active row, one context
fragment instead of four, no hairlines. When density is the complaint, adding refinement makes it
worse.

## The traps this project has already fallen into

Moved to [LLIÇONS.md](LLIÇONS.md). The list outgrew this file — it is read while writing code, not
while planning a phase, and by eleven entries the numbering had already broken twice.
