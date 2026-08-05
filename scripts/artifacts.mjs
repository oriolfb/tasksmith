/**
 * The one place that knows which files Obsidian needs and where they go.
 *
 * Shared by `npm run deploy` and the watch build, so a one-shot deploy and an automatic one can
 * never disagree about what got copied.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";

export const ARTIFACTS = ["main.js", "manifest.json", "styles.css"];

const DEFAULT_VAULT = join(
  homedir(),
  "Library/Mobile Documents/iCloud~md~obsidian/Documents/Bershka"
);

/** Returns the vault path, or null when there is no vault there. */
export function resolveVault() {
  const vault = process.env.TASK_CONSOLE_VAULT ?? DEFAULT_VAULT;
  return existsSync(join(vault, ".obsidian")) ? vault : null;
}

/**
 * Copies the artifacts that exist into `<vault>/.obsidian/plugins/<id>/`.
 *
 * Development lives outside the vault so `node_modules` never enters iCloud sync; nothing but
 * these three files is ever written there.
 */
export function copyArtifacts(vault) {
  const present = ARTIFACTS.filter((file) => existsSync(file));
  const missing = ARTIFACTS.filter((file) => !existsSync(file));

  const { id } = JSON.parse(readFileSync("manifest.json", "utf8"));
  const target = join(vault, ".obsidian", "plugins", id);
  mkdirSync(target, { recursive: true });

  for (const file of present) copyFileSync(file, join(target, file));

  return { id, target, copied: present, missing };
}
