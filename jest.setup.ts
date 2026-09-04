if (typeof window === "undefined") {
  (globalThis as { window?: typeof globalThis }).window = globalThis;
}

import { setLocale } from "./src/i18n/strings";

// Deterministic locale for tests: the real plugin picks it from Obsidian's runtime, but a test
// run has no navigator language to key off, and existing assertions are written in Catalan.
setLocale("ca");
