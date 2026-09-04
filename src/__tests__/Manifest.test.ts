import { readFileSync } from "fs";
import { resolve } from "path";

describe("manifest support contract", () => {
  it("does not advertise mobile support before the plugin has a mobile layout", () => {
    const manifest = JSON.parse(readFileSync(resolve(__dirname, "../../manifest.json"), "utf8")) as {
      isDesktopOnly?: boolean;
    };
    expect(manifest.isDesktopOnly).toBe(true);
  });

  it("pins the Obsidian API as a development-only build dependency", () => {
    const pkg = JSON.parse(readFileSync(resolve(__dirname, "../../package.json"), "utf8")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    expect(pkg.dependencies?.obsidian).toBeUndefined();
    expect(pkg.devDependencies?.obsidian).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
