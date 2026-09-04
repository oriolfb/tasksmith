# CLAUDE.md

Read [`Docs/ARCHITECTURE.md`](Docs/ARCHITECTURE.md) for the design and [`Docs/LLIÇONS.md`](Docs/LLIÇONS.md)
for the mistakes already paid for. Both are worth a skim before touching `query/` or `index/`.

## TDD is how this project is built

Every behaviour change — new feature, bug fix, edge case — starts with a test, not with the
implementation:

1. **Write or extend a test first**, in `src/__tests__/<Name>.test.ts`, that describes the behaviour
   you're about to add or the bug you're about to fix. It must fail before you touch the
   implementation.
2. **Run it and read the failure.** `npm test` or `npm run test:watch` for the loop. Confirm it fails
   for the reason you expect (the assertion, not a typo or a bad import) — a test that fails for the
   wrong reason proves nothing when it later goes green.
3. **Write the minimal implementation change** that makes it pass. Resist fixing adjacent things in
   the same pass.
4. **Run the full suite**, not just the new test. Everything green, or the task isn't done.
5. **Refactor only with green tests underneath**, and re-run after.

Never report a task as finished with a red or skipped test. CI (`.github/workflows/lint.yml`) runs
`npm test` on every push, but that is the safety net, not the workflow — the point of TDD here is
the local loop above, before the commit exists.

### Why this fits this codebase

Per `ARCHITECTURE.md`: `Focus.ts`, `Metrics.ts`, `Health.ts` and `Filters.ts` are pure functions —
tasks and a date in, data out, no `DOM`, no `App`, no settings object. That's what makes writing the
test first cheap: no mocking a view or the Obsidian API to exercise the logic. `buildTasks.tasksFromFile`
is the one parsing path shared by the live index and `vaultAudit.test.ts`, so a test against it is a
test against what the UI actually shows.

`src/__mocks__/obsidian.ts` (wired via `moduleNameMapper` in `jest.config.js`) stands in for the
Obsidian API when a test needs it.

### Anti-patterns already caught once (see `Docs/LLIÇONS.md`)

- **Don't write a test that just encodes current behaviour.** `prune([])` once meant "the task was
  deleted" and passed while asserting the exact bug. If a test can't fail, it isn't testing anything.
- **Don't pin numbers pulled from the live vault** (`expect(x.length).toBeGreaterThan(0)`). Assert
  invariants; add a synthetic fixture when the rule needs data that may not exist yet.
