import esbuild from "esbuild";
import process from "process";
import builtins from "builtin-modules";
import { watch } from "fs";
import { copyArtifacts, resolveVault } from "./scripts/artifacts.mjs";

/**
 * Three modes:
 *   production    one minifiable build, no sourcemap, exits.
 *   deploy-watch  rebuild on save *and* copy into the vault. `⌘R` in Obsidian and you are done.
 *   (default)     rebuild on save, leaving the output in the project folder.
 */
const mode = process.argv[2] ?? "watch";
const prod = mode === "production";
const deploying = mode === "deploy-watch";

const vault = deploying ? resolveVault() : null;
if (deploying && !vault) {
  console.error("No vault found. Set TASK_SMITH_VAULT to your vault's path.");
  process.exit(1);
}

/** Copies after every successful rebuild. A failed build must never reach the vault. */
const deployPlugin = {
  name: "deploy-to-vault",
  setup(build) {
    build.onEnd((result) => {
      if (result.errors.length > 0) {
        console.error(`✗ ${stamp()} build failed, vault left untouched`);
        return;
      }
      const { copied, missing } = copyArtifacts(vault);
      const note = missing.length > 0 ? ` (missing ${missing.join(", ")})` : "";
      console.log(`✓ ${stamp()} copied ${copied.join(", ")}${note} — ⌘R a Obsidian`);
    });
  },
};

const context = await esbuild.context({
  entryPoints: ["src/main.ts"],
  bundle: true,
  external: [
    "obsidian",
    "electron",
    "@codemirror/autocomplete",
    "@codemirror/collab",
    "@codemirror/commands",
    "@codemirror/language",
    "@codemirror/lint",
    "@codemirror/search",
    "@codemirror/state",
    "@codemirror/view",
    "@lezer/common",
    "@lezer/highlight",
    "@lezer/lr",
    ...builtins,
  ],
  format: "cjs",
  target: "es2021",
  logLevel: "info",
  sourcemap: prod ? false : "inline",
  treeShaking: true,
  outfile: "main.js",
  plugins: deploying ? [deployPlugin] : [],
});

if (prod) {
  await context.rebuild();
  process.exit(0);
}

await context.watch();

if (deploying) {
  console.log(`Watching src/, styles.css and manifest.json → ${vault}`);
  // esbuild only knows about the TypeScript graph, and phase 2 is mostly CSS: without this,
  // editing styles.css would silently never reach the vault.
  for (const file of ["styles.css", "manifest.json"]) {
    watch(file, debounce(() => {
      const { copied } = copyArtifacts(vault);
      console.log(`✓ ${stamp()} ${file} changed, copied ${copied.length} files — ⌘R a Obsidian`);
    }));
  }
}

function stamp() {
  return new Date().toTimeString().slice(0, 8);
}

/** Editors save in bursts; fs.watch fires several times for one ⌘S. */
function debounce(fn, ms = 80) {
  let timer = null;
  return () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(fn, ms);
  };
}
