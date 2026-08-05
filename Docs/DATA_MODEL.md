# Data model

Types live in `src/types/task.ts`.

## ParsedTask

One markdown line, parsed but never rebuilt.

| Field | Meaning |
|---|---|
| `raw` | The line verbatim. Every edit splices this string. |
| `indent` | Leading spaces or tabs (43 vault tasks are tab-indented subtasks). |
| `bullet` | `-`, `*` or `+`. |
| `status` | The character between brackets; `" "` is open. |
| `statusOffset` | Offset of that character in `raw`. |
| `description` | Line with recognised fields stripped, trimmed. |
| `bodySpan` | Region left after all fields were consumed. |
| `fields` | `Partial<Record<FieldKey, TaskField>>`. |
| `tags`, `links` | Extracted from the description; the description keeps them. |

## TaskField

| Field | Meaning |
|---|---|
| `key` | `due`, `scheduled`, `start`, `done`, `cancelled`, `created`, `recurrence`, `priority`, `id`, `dependsOn`, `onCompletion`. |
| `marker` | The emoji as written (`📅`, `📆` and `🗓` all map to `due`). |
| `value` | Trimmed text after the marker. |
| `date` | `YYYY-MM-DD` parsed to local midnight; `null` when unusable. A `YYYY-MM-DD` template literal never becomes a date. |
| `span` | `[start, end)` in `raw`, including the whitespace before the marker so removal leaves no double space. |

## Task

`ParsedTask` plus context resolved from the host note:

| Field | Source |
|---|---|
| `location` | `{ path, line }`, 0-based line. |
| `project` | `Projecte:` in the note's frontmatter, wikilinks unwrapped. Empty in about two thirds of the open tasks, which is why it is no longer an axis of the interface. |
| `area` | `Àrea:` in frontmatter, else the top-level folder. |
| `people` | Every name in `Persones:`, wikilinks unwrapped. A task can belong on several agendas, so per-person counts sum to more than the task count. |
| `noteTitle` | `title:` in frontmatter; `null` falls back to the filename. |
| `noteType` | `tipus:` in frontmatter. |
| `noteDate` | `data:` in frontmatter, whether or not it counts as a deadline. |
| `filenameDate` | Date implied by the note's filename via the Tasks plugin's format. |
| `effectiveDate` | `due ?? scheduled ?? start ?? filenameDate ?? noteDate` — the last one only for notes listed in `deadlineFromNotes`. |
| `kind` | `commitment` · `reference` · `someday`, from `noteType`. |
| `open` | Status type is `TODO` or `IN_PROGRESS`. |
| `priority` | Derived from the priority marker. No open task in this vault has one. |

## Buckets

`overdue` · `today` · `week` (to Sunday) · `later` · `undated` · `closed`.
Exhaustive and mutually exclusive; the vault audit test asserts the partition holds.

## Persisted settings

`src/settings/Config.ts` — `excludedFolders`, `respectObsidianIgnoreFilters`,
`staleThresholdDays`, `showOverdueBadge`, `autoDeleteEmptyTasks` (off), and the three context
rules below. Nothing about task syntax is stored here: that comes from the Tasks plugin's own
`data.json` at runtime.

| Setting | Default | Meaning |
|---|---|---|
| `deadlineFromNotes` | `["Nota_Diaria", "Nota_Setmanal"]` | Note tags or `tipus` values whose `data:` is a deadline. |
| `referenceNoteTypes` | `["documentacio"]` | `tipus` values whose task lines are documentation. |
| `somedayNoteTypes` | `[]` | `tipus` values whose task lines are someday/maybe. Add `idea` to use it. |
