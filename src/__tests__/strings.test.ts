import { resolveLocale, detectLocale, t, tn, setLocale, getLocale } from "../i18n/strings";

describe("detectLocale", () => {
  const originalNavigator = (globalThis as { navigator?: unknown }).navigator;
  const originalLocalStorage = (globalThis as { localStorage?: unknown }).localStorage;

  afterEach(() => {
    (globalThis as { navigator?: unknown }).navigator = originalNavigator;
    (globalThis as { localStorage?: unknown }).localStorage = originalLocalStorage;
  });

  it("prefers Obsidian's own configured language over the OS locale", () => {
    (globalThis as { navigator?: unknown }).navigator = { language: "es-ES" };
    (globalThis as { localStorage?: unknown }).localStorage = {
      getItem: (key: string) => (key === "language" ? "ca" : null),
    };
    expect(detectLocale()).toBe("ca");
  });

  it("falls back to the OS locale when Obsidian has no language stored", () => {
    (globalThis as { navigator?: unknown }).navigator = { language: "es-ES" };
    (globalThis as { localStorage?: unknown }).localStorage = {
      getItem: () => null,
    };
    expect(detectLocale()).toBe("es");
  });
});

describe("resolveLocale", () => {
  it("maps a supported BCP-47 tag to its base locale", () => {
    expect(resolveLocale("es-ES")).toBe("es");
    expect(resolveLocale("ca")).toBe("ca");
    expect(resolveLocale("en-GB")).toBe("en");
  });

  it("falls back to English for an unsupported or missing tag", () => {
    expect(resolveLocale("fr-FR")).toBe("en");
    expect(resolveLocale(undefined)).toBe("en");
    expect(resolveLocale(null)).toBe("en");
  });
});

describe("t", () => {
  afterEach(() => setLocale("ca"));

  it("returns the string for the active locale", () => {
    setLocale("ca");
    expect(t("button.cancel")).toBe("Cancel·lar");
    setLocale("es");
    expect(t("button.cancel")).toBe("Cancelar");
    setLocale("en");
    expect(t("button.cancel")).toBe("Cancel");
  });

  it("interpolates params into the template", () => {
    setLocale("en");
    expect(t("notice.fileNotFound", { path: "foo.md" })).toBe("Can't find foo.md");
  });

  it("falls back to the key itself when unknown", () => {
    expect(t("nonexistent.key")).toBe("nonexistent.key");
  });

  it("defaults to a resolved locale and can be switched", () => {
    setLocale("es");
    expect(getLocale()).toBe("es");
  });
});

describe("tn", () => {
  afterEach(() => setLocale("ca"));

  it("picks the singular form for count 1 and plural otherwise", () => {
    setLocale("en");
    expect(tn("kpi.openNotes", 1)).toBe("in 1 note");
    expect(tn("kpi.openNotes", 3)).toBe("in 3 notes");
  });
});
