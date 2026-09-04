import { readFileSync } from "fs";
import { resolve } from "path";

const css = readFileSync(resolve(__dirname, "../../styles.css"), "utf8");

function declarations(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return css.match(new RegExp(`${escaped}\\s*\\{([^}]+)\\}`))?.[1] ?? "";
}

describe("control centre styles", () => {
  it("keeps the search clear action visually subordinate to the field across themes", () => {
    const clear = declarations(".tcc-search-wrap .tcc-search-clear");
    expect(clear).toContain("width: 20px");
    expect(clear).toContain("height: 20px");
    expect(clear).toContain("border: 0");
    expect(clear).toContain("background: transparent");
    expect(clear).toContain("box-shadow: none");

    const icon = declarations(".tcc-search-wrap .tcc-search-clear svg");
    expect(icon).toContain("width: 14px");
    expect(icon).toContain("height: 14px");
    expect(icon).toContain("border-radius: 50%");
    expect(icon).toContain("background: var(--text-muted)");
  });

  it("shows focus on keyboard-enabled task actions", () => {
    const focus = declarations(".tcf-mark:focus-visible,\n.tcc-mark:focus-visible,\n.tcf-more:focus-visible,\n.tcc-bulk .tcc-act:focus-visible");
    expect(focus).toContain("outline: 2px solid var(--interactive-accent)");
  });
});
