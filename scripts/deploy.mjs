/**
 * One-shot deploy: build first, then copy the three files Obsidian needs into the vault.
 *
 * Override the target with TASK_CONSOLE_VAULT. For a loop that copies on every save, use
 * `npm run deploy:watch` instead.
 */
import { ARTIFACTS, copyArtifacts, resolveVault } from "./artifacts.mjs";
import { existsSync } from "fs";

const vault = resolveVault();
if (!vault) {
  console.error(`No vault found. Set TASK_CONSOLE_VAULT to your vault's path.`);
  process.exit(1);
}

const missing = ARTIFACTS.filter((file) => !existsSync(file));
if (missing.length > 0) {
  console.error(`Missing build output: ${missing.join(", ")}. Run npm run build first.`);
  process.exit(1);
}

const { id, target } = copyArtifacts(vault);

console.log(`Deployed ${id} to ${target}`);
console.log("Reload Obsidian (⌘R) or disable/enable the plugin to pick up the change.");
