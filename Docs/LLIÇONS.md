# Lliçons

Bugs this project has already paid for, written down so the next session does not pay again. Each
one names the mistake, not the fix: a fix is in the code, a mistake is a shape you can recognise
somewhere else. Referenced by name, never by number — this list only grows.

The general ones come first. The last two sections are specific to Obsidian and to CSS, and are
worth skimming before touching either.

## Diagnosis

**Reasoning about where the time goes.** Four plausible causes for a slow load — the parser, iCloud
materialising dataless files, notes without tasks being read anyway, sequential I/O — and a 40-line
bench over the real vault killed three of them in one run. Two of the three would have been real
work: a metadata prefilter, a persisted index. Neither was needed. The bench cost ten minutes and is
worth writing before the first line of the fix, not after.

**Explaining away a screenshot instead of diagnosing it.** Faced with "it still looks wrong", the
deduction "your screenshot must be stale" was made from a single detail and was wrong. Cheap
diagnostics that would have settled it in one step: grep the *deployed* bundle for the new markers,
list every copy of the plugin on disk, check which vault Obsidian actually has open, and put the
loaded version in the settings tab.

**A control that silently does nothing usually means the render threw halfway.** Not "the handler
did not fire". The previous DOM is still on screen because the paint that would have replaced it
died mid-way, and nothing in the console says so. Check the paint before checking the wiring.

## State and data

**Letting "empty" and "not loaded yet" be the same value.** The day's plan is reconciled against the
index on every paint, and before the first scan the index answers `[]`. Every chosen key therefore
answered "this task no longer exists", the plan was emptied — and *persisted*, which made the loss
permanent. It happened on every Obsidian start for as long as the scan was slow. Anything that asks
a cache "does this still exist?" needs the cache to be able to answer "I have not looked yet"; that
is what `index.ready` is.

**Two bugs can be one bug.** The slow scan did not cause the wipe above — it widened the window
until the window was every startup. Fixing either alone would have left the other reachable, and
fixing the visible one first would have made the real one rare enough to look fixed.

**Counting emoji with a character class.** `/[🔺⏫🔼🔽⏬]/` without the `u` flag matches the
*surrogate halves*, so it also matches `📅`. It reported 28 tasks with a priority when the real
answer is zero, and that wrong number was used to justify keeping the priority UI. A wrong number
does not stay a wrong number; it becomes a decision.

## Tests

**A test that encodes the ambiguity, and passes.** `prune([])` was the suite's way of saying "the
task was deleted" — it asserted, in green, the exact behaviour that lost the day's plan. Fixing the
bug meant editing a test that had never failed. Symptom to recognise: a test handing an empty
collection to mean "this particular thing is absent". An empty collection means nothing of the sort;
name the absent thing and pass the others.

**Pinning a count from a live vault in a test.** It happened twice: once with the bucket counts,
once with `expect(weekly.length).toBeGreaterThan(0)` — which passed the day it was written and
failed the moment the weekly notes were emptied for real. Assert invariants; add a synthetic case
when the rule needs data that may not exist.

## The dev loop

**Letting Jest see the other worktrees.** `.claude/worktrees/` sits *inside* the repo, so every
worktree is one more `src/__mocks__/obsidian.ts` in Jest's module map: `npm test` in the main tree
found four of them, warned about the duplicates, and then resolved `obsidian` to whichever copy it
liked — a mock from another branch. The symptom is a class that is plainly in the file failing with
"Class extends value undefined", and the warning that explains it has scrolled off the top. Fixed
with `modulePathIgnorePatterns`. The shape to recognise: a tool that indexes by filename, pointed at
a tree that contains copies of the project.

**Assuming a deploy is a reload.** `styles.css` is picked up live, `main.js` is not. New CSS on old
JS produced a screenshot that looked like nothing had changed. Bump the version on every visible
change and read it back from the settings tab.

## Rendering inside Obsidian

**Styling something Obsidian already styles.** A plugin that restyles `<button>` fights the theme
and loses in a different way in every theme. Use what the app already gives you.

**Resolving a promise from `onClose`.** `SuggestModal.selectSuggestion` calls `close()` — which runs
`onClose()` on the spot on desktop — and only *then* `onChooseSuggestion`. So the obvious
"resolve `null` from `onClose` unless it was already settled" answers *cancelled* a beat before the
modal is told what was picked, and the choice is lost with no error anywhere. `PickModal` shipped
like that, which means `+ filtre → Projecte…` did nothing at all; on the phone it worked, because
the close animation defers `onClose` past the pick — a bug present only on the platform the plugin
is designed for. The date field copied the pattern and a test caught it, driving both callbacks in
the app's order. Two lessons in one: read the bundle for the order instead of assuming a callback
runs before the teardown, and when the answer can arrive from two directions, let the *decision*
settle it and make the *default* wait a microtask.

**Trusting one class to beat a theme.** Themes style buttons as `<container> button`, which
outweighs a plugin's single `.tcf-tab` and reinstates the grey chrome on *both* tabs, flattening the
very difference the state colour was meant to draw. Rules a theme must not reach go two classes
deep, and `mockups/06-render-real.html` simulates buttons at theme specificity so the regression
shows up outside Obsidian.

**The visible icon and its hit target are not the same box.** The first search-clear control put a
circle, background and 22 px dimensions on the `<button>` itself. A theme's button chrome then
turned a small utility into a heavy, standalone control — visually louder than the query it was
meant to clear. Obsidian's own pattern separates the two jobs: a transparent, fully reset 20 px
button provides the forgiving click and keyboard target, while its 14 px `svg` carries the filled
circle and inverse cross. This keeps the affordance compact without making it hard to hit. The reset
(`border`, `box-shadow`, minimum dimensions and `appearance`) still needs a two-class selector to
beat theme specificity; copying the native silhouette without protecting it from the theme only
copies it in one screenshot.

**Marking a state with a colour the pane already uses.** The active lens carried
`--background-secondary`, which in the left dock *is* the pane background: the pill existed and was
invisible, so neither tab looked selected. A state colour has to come from a hue the surroundings
never use — here `--tcf-lila`, the accent that already means "you chose this".

## One class, two jobs

Twice, in two costumes. Both times the class was doing something structural *and* something
visual, and changing one broke the other with no error anywhere.

**Overwriting a class that is also a query hook.** `lead.className = "ord"` erased the `.lead` the
next paint looked for; `paint()` threw before it swapped the list, so the lens button did nothing
and the animation never ran.

**One class placing a column *and* hiding it.** The control centre's table gave the header cell and
the row's action container one class, so the `opacity: 0` that keeps the action words hidden until
hover also made the "Accions" *heading* invisible. Hook and state coexist —
`"tcc-cell-actions tcc-acts"` — and the harness caught it, not a screenshot.

## CSS that breaks the layout, not the paint

**`container-type` means the width can no longer come from the contents.** `container-type:
inline-size`, added to the control centre's root so the table could drop columns in a split tab,
collapsed the whole tab to a 30px column: an inline-size container cannot be sized by what is inside
it, so it needs `width: 100%` from its parent. One computed-style read settles it; the screenshot
just looks broken.
