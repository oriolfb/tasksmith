/**
 * Copies only the three files Obsidian needs into the vault's plugin folder.
 * Development stays outside the vault so node_modules never enters iCloud sync.
 *
 * Override the target with TASK_CONSOLE_VAULT.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";

const ARTIFACTS = ["main.js", "manifest.json", "styles.css"];

const vault =
  process.env.TASK_CONSOLE_VAULT ??
  join(homedir(), "Library/Mobile Documents/iCloud~md~obsidian/Documents/Bershka");

if (!existsSync(join(vault, ".obsidian"))) {
  console.error(`No vault at ${vault}. Set TASK_CONSOLE_VAULT.`);
  process.exit(1);
}

const missing = ARTIFACTS.filter((file) => !existsSync(file));
if (missing.length > 0) {
  console.error(`Missing build output: ${missing.join(", ")}. Run npm run build first.`);
  process.exit(1);
}

const { id } = JSON.parse(readFileSync("manifest.json", "utf8"));
const target = join(vault, ".obsidian", "plugins", id);
mkdirSync(target, { recursive: true });

for (const file of ARTIFACTS) {
  copyFileSync(file, join(target, file));
}

console.log(`Deployed ${id} to ${target}`);
console.log("Reload Obsidian (or disable/enable the plugin) to pick up the change.");
