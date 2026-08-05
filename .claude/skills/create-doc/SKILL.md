---
name: create-doc
description: Create or update this project's documentation (Docs/) based on the current conversation context.
disable-model-invocation: false
user-invocable: true
metadata:
  version: "1.0"
  license: MIT
---

# How to create documentation

Docs live flat in [`Docs/`](../../../Docs) (capital D, no category subfolders). Five files, each
with a fixed job:

| File | Covers |
|---|---|
| [`Docs/API.md`](../../../Docs/API.md) | Commands, views, quick actions, public method tables — anything a caller or user can invoke. |
| [`Docs/ARCHITECTURE.md`](../../../Docs/ARCHITECTURE.md) | Layers, key decisions (the *why*, not just the *what*), the effective-date rule, known limitations. |
| [`Docs/DATA_MODEL.md`](../../../Docs/DATA_MODEL.md) | Types in `src/types/`, one field-by-field table per type. |
| [`Docs/ROADMAP.md`](../../../Docs/ROADMAP.md) | Phase status, settled decisions with their measured effect on the real vault, what's next. |
| [`Docs/CHANGELOG.md`](../../../Docs/CHANGELOG.md) | Per-version `### Added` / `### Changed` / `### Fixed`, Keep-a-Changelog style, with an `## Unreleased` section at the top for work not yet cut into a version. |

`Docs/mockups/` holds HTML UI previews, not written docs — out of scope for this skill.

Run this after an interaction where something worth documenting happened: a design decision got
made and justified, a new command/method/type landed, or a change needs a changelog line. Use the
conversation context to draft the doc automatically instead of asking the user to dictate it.

## Steps

### Step 1: Figure out what happened and where it belongs

1. Name the one thing worth recording: a decision + rationale, a new API surface, a new/changed
   type, a shippable change, or a roadmap update.
2. Run `ls Docs/` and match it to the table above. If it genuinely fits none of the five, ask the
   user before creating a new file — this project deliberately keeps the doc set small and flat.
3. Pull out the **why**, not just the *what*. This project's docs lead with a claim and justify it
   with a measured effect or a failure mode avoided (see `ARCHITECTURE.md`'s "Key decisions" and
   `ROADMAP.md`'s "Where the numbers come from") — they don't narrate implementation mechanically.

### Step 2: Confirm only if necessary

Only ask (via `AskUserQuestion` or directly) if:

- It's unclear which of the five files owns the topic, or whether it needs a new file.
- The decision's rationale isn't in the conversation (you can restate *what* changed but not
  *why* it matters).
- A CHANGELOG entry's category (Added/Changed/Fixed/Removed) is ambiguous.

If the conversation already gives enough, write the doc directly.

### Step 3: Match this project's voice

- Bold a one-sentence claim, then justify it — e.g. *"**Deletions are batched per file,
  bottom-up.** Removing a line shifts every line below it, so..."*.
- Tables over prose lists for anything enumerable: commands, fields, methods, phases.
- Code fences for diagrams and formulas (see the layers diagram and the `effectiveDate` formula
  in `ARCHITECTURE.md`), not screenshots.
- Doc prose is English even though UI copy, command names and commit messages are Catalan — quote
  Catalan strings verbatim (as `API.md`'s commands table does) but keep the surrounding text
  English.
- No throat-clearing intros ("In this section we will…"). Start with the claim.
- Wrap prose near ~100 characters per line, matching the existing files — there's no
  markdownlint/eslint config to enforce it, so match by eye against a neighboring file.
- CHANGELOG entries go under `## Unreleased` using Keep-a-Changelog subheadings (`### Added`,
  `### Changed`, `### Fixed`, `### Removed`); bold the one-liner that matters, plain text for
  supporting detail. Version headers (`## 0.2.2`) get cut at release time, not by this skill.

### Step 4: Write it

- Update the matching file in place — add a row to an existing table, a bullet under "Key
  decisions", a new type section, or an `## Unreleased` entry. Don't restructure unrelated
  sections while you're in there.
- There's no `AGENTS.md` or docs index to keep in sync — `Docs/` has no separate table of
  contents, so no further file needs updating.

## Reminders

- Derive everything from the conversation context; ask only when genuinely ambiguous.
- Keep the tone terse and decision-driven, matching `Docs/ARCHITECTURE.md`.
