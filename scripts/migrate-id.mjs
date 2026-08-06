/**
 * Moves an installation from one plugin id to another. Used twice: `task-console` → `tasks-smith`,
 * then `tasks-smith` → `task-smith` when the name lost its double s.
 *
 * A plugin id is the folder name inside the vault, the key in `community-plugins.json` and the
 * prefix of every command id, so renaming it strands the settings, the enabled flag and the saved
 * layout. This carries all four across and removes the old folder.
 *
 * Obsidian must be closed: it rewrites `workspace.json` on quit and would undo the layout part.
 *
 *   node scripts/migrate-id.mjs [--from <old-id>] [--to <new-id>] [--dry-run]
 *
 * Idempotent — running it twice does nothing the second time.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { resolveVault } from "./artifacts.mjs";

const OLD_ID = argOr("--from", "task-console");
const NEW_ID = argOr("--to", "task-smith");
const dryRun = process.argv.includes("--dry-run");

const vault = resolveVault();
if (!vault) {
  console.error("No vault found. Set TASK_SMITH_VAULT to your vault's path.");
  process.exit(1);
}

function argOr(flag, fallback) {
  const at = process.argv.indexOf(flag);
  return at === -1 ? fallback : (process.argv[at + 1] ?? fallback);
}

const config = join(vault, ".obsidian");
const oldDir = join(config, "plugins", OLD_ID);
const newDir = join(config, "plugins", NEW_ID);
const done = [];
const skipped = [];

// 1. The settings, which also hold the day's plan and the folded sections.
if (existsSync(join(oldDir, "data.json"))) {
  if (existsSync(join(newDir, "data.json"))) {
    skipped.push(`data.json already in ${NEW_ID}, left the old one alone`);
  } else {
    act(`copy data.json → plugins/${NEW_ID}/`, () => {
      mkdirSync(newDir, { recursive: true });
      copyFileSync(join(oldDir, "data.json"), join(newDir, "data.json"));
    });
  }
} else {
  skipped.push(`no data.json in plugins/${OLD_ID}`);
}

// 2. The enabled list, the saved layout and any hotkey, all of which key on the id.
for (const file of ["community-plugins.json", "workspace.json", "workspace-mobile.json", "hotkeys.json"]) {
  const path = join(config, file);
  if (!existsSync(path)) continue;

  const before = readFileSync(path, "utf8");
  const after = before
    .replaceAll(`"${OLD_ID}-sidebar"`, `"${NEW_ID}-sidebar"`)
    .replaceAll(`"${OLD_ID}-triage"`, `"${NEW_ID}-triage"`)
    .replaceAll(`"${OLD_ID}:`, `"${NEW_ID}:`)
    .replaceAll(`"${OLD_ID}"`, `"${NEW_ID}"`);

  if (after === before) {
    skipped.push(`${file} had no reference to ${OLD_ID}`);
    continue;
  }
  act(`rewrite ${file} (backup at ${file}.${OLD_ID}.bak)`, () => {
    writeFileSync(`${path}.${OLD_ID}.bak`, before);
    writeFileSync(path, after);
  });
}

// 3. The old folder, once nothing points at it any more.
if (existsSync(oldDir)) {
  act(`remove plugins/${OLD_ID}/`, () => rmSync(oldDir, { recursive: true }));
} else {
  skipped.push(`plugins/${OLD_ID}/ is already gone`);
}

for (const line of skipped) console.log(`·  ${line}`);
for (const line of done) console.log(`${dryRun ? "would" : "✓"} ${line}`);
if (done.length === 0) console.log("Nothing left to migrate.");
else if (!dryRun) console.log(`\nNow run \`npm run deploy\` and check the plugin is enabled in Settings → Community plugins.`);

// A copy rather than a move: inside an iCloud-synced folder a rename can race with the sync
// daemon, and the old folder is removed at the end anyway.
function act(label, run) {
  done.push(label);
  if (!dryRun) run();
}
