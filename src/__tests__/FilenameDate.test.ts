import { filenameDate } from "../index/FilenameDate";
import { DEFAULT_INTEROP, parseTasksData, type TasksInterop } from "../tasks/TasksPluginSettings";
import { formatIsoDate } from "../index/dates";

const vaultInterop: TasksInterop = {
  ...DEFAULT_INTEROP,
  useFilenameAsScheduledDate: true,
  // Exactly what the vault's Tasks plugin stores.
  filenameAsScheduledDateFormat: "\\D\\i\\a\\r\\i YYYY-MM-DD",
};

const iso = (date: Date | null) => (date ? formatIsoDate(date) : null);

describe("filenameDate", () => {
  it("reads the vault's daily note format", () => {
    expect(iso(filenameDate("Diari 2026-03-10", "01 Diari/2026/03", vaultInterop))).toBe("2026-03-10");
  });

  it("ignores notes that do not match the format", () => {
    expect(filenameDate("2026-03-04 - Olaia & Dani Amoedo", "02 Reunions & Seguiment", vaultInterop)).toBeNull();
    expect(filenameDate("Setmana 2026-W10", "01 Diari", vaultInterop)).toBeNull();
    expect(filenameDate("Diari", "01 Diari", vaultInterop)).toBeNull();
  });

  it("rejects a matching name with an impossible date", () => {
    expect(filenameDate("Diari 2026-02-31", "01 Diari", vaultInterop)).toBeNull();
  });

  it("returns null when the Tasks setting is off", () => {
    expect(filenameDate("Diari 2026-03-10", "01 Diari", DEFAULT_INTEROP)).toBeNull();
  });

  it("honours the folder restriction when Tasks sets one", () => {
    const scoped = { ...vaultInterop, filenameAsDateFolders: ["01 Diari"] };
    expect(iso(filenameDate("Diari 2026-03-10", "01 Diari/2026/03", scoped))).toBe("2026-03-10");
    expect(filenameDate("Diari 2026-03-10", "03 Projectes", scoped)).toBeNull();
  });

  it("bails out on an unsupported moment token rather than guessing", () => {
    const weird = { ...vaultInterop, filenameAsScheduledDateFormat: "YYYY-MMM-DD" };
    expect(filenameDate("2026-Mar-10", "01 Diari", weird)).toBeNull();
  });
});

describe("parseTasksData", () => {
  it("reads the vault's real settings shape, with custom statuses overriding core", () => {
    const interop = parseTasksData(
      JSON.stringify({
        taskFormat: "tasksPluginEmoji",
        useFilenameAsScheduledDate: true,
        filenameAsScheduledDateFormat: "\\D\\i\\a\\r\\i YYYY-MM-DD",
        filenameAsDateFolders: [],
        setCreatedDate: true,
        setDoneDate: true,
        statusSettings: {
          coreStatuses: [{ symbol: " ", name: "Todo", nextStatusSymbol: "x", type: "TODO" }],
          customStatuses: [
            { symbol: "/", name: "In Progress", nextStatusSymbol: "x", type: "IN_PROGRESS" },
            { symbol: "-", name: "Cancelled", nextStatusSymbol: " ", type: "CANCELLED" },
            { symbol: ">", name: "forwarded", nextStatusSymbol: "x", type: "TODO" },
          ],
        },
      })
    );
    expect(interop.useFilenameAsScheduledDate).toBe(true);
    expect(interop.setCreatedDate).toBe(true);
    expect(interop.statuses.get("/")?.type).toBe("IN_PROGRESS");
    expect(interop.statuses.get(">")?.type).toBe("TODO");
    expect(interop.statuses.get("x")?.type).toBe("DONE");
  });

  it("falls back to defaults on malformed json instead of throwing", () => {
    expect(parseTasksData("{ not json")).toBe(DEFAULT_INTEROP);
  });
});
