# TaskSmith

An Obsidian plugin that reads every task in the vault and answers two different questions in two
different places.

- **The sidebar** answers *what do I do now*. Two lenses (by date, by who you are with), three day
  slots you pick yourself, overdue tasks framed as things to renegotiate rather than failures.
- **The control centre** answers *how is the system doing*. A KPI strip, throughput, filter chips, a
  sortable table and a health panel.

It reads the same markdown as the [Tasks](https://github.com/obsidian-tasks-group/obsidian-tasks)
plugin — emoji dates, priorities, recurrence — and picks up its date format and global filter from
its settings, so both plugins see the same tasks. Nothing leaves the vault: no network calls, no
telemetry.

## Requirements

- Obsidian 1.6.0 or later.
- The Tasks plugin, for the task syntax and its settings. TaskSmith falls back to built-in
  defaults if it is not installed.

## Install

Not in the community catalogue yet. Copy `main.js`, `manifest.json` and `styles.css` into
`<Vault>/.obsidian/plugins/task-smith/`, then enable it in **Settings → Community plugins**.

## Commands

| Command | Effect |
|---|---|
| Obrir la barra lateral de tasques | Reveals the sidebar in the right dock. |
| Obrir el centre de control | Opens the control centre in a tab. |
| Refer l'índex de tasques | Re-reads the Tasks plugin config and rescans the vault. |
| Eliminar les tasques buides ara | Deletes empty task lines outside the active note. |
| Desfés l'últim canvi del plugin | Reverts the newest write. No default hotkey — `Mod+Z` belongs to the editor. |

See [`Docs/API.md`](Docs/API.md) for view ids, settings keys and the full surface.

## Develop

```bash
npm install
npm run dev          # rebuild on save, output stays in the project folder
npm run deploy:watch # rebuild on save and copy into the vault
npm run build        # type-check and produce a minified main.js
npm run lint         # ESLint with eslint-plugin-obsidianmd
npm test             # Jest
npm run test:watch   # Jest in watch mode, for TDD
```

`npm run deploy` builds once and copies `main.js`, `manifest.json` and `styles.css` into
`<vault>/.obsidian/plugins/task-smith/`. Set `TASK_SMITH_VAULT` to target a different vault.
Development lives outside the vault so `node_modules` never enters iCloud sync.

## Release

Update `minAppVersion` in `manifest.json` by hand if it changed, then:

```bash
npm version patch
```

That bumps `package.json` and `manifest.json` and adds the entry to `versions.json`. Push the tag
and the release workflow builds the plugin and opens a draft release with `main.js`,
`manifest.json` and `styles.css` attached. Tags carry no `v` prefix.

## Documentation

| File | Contents |
|---|---|
| [`Docs/ARCHITECTURE.md`](Docs/ARCHITECTURE.md) | How the layers fit together, and what Obsidian's renderer forces. |
| [`Docs/DATA_MODEL.md`](Docs/DATA_MODEL.md) | The task shape and how markdown maps onto it. |
| [`Docs/API.md`](Docs/API.md) | Commands, view ids, settings. |
| [`Docs/CHANGELOG.md`](Docs/CHANGELOG.md) | What changed, and why. |
| [`Docs/ROADMAP.md`](Docs/ROADMAP.md) | What is next. |

## License

MIT. See [`LICENSE`](LICENSE).
