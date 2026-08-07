import { parseDateInput } from "../query/DateInput";
import { formatIsoDate } from "../index/dates";

const D = (iso: string): Date => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y!, m! - 1, d);
};

/** Dimecres. Every expectation below is read against it. */
const TODAY = D("2026-08-05");
const FRIDAY = D("2026-08-07");

const dates = (text: string, today = TODAY): string[] =>
  parseDateInput(text, today).map((match) => formatIsoDate(match.date));

const labels = (text: string, today = TODAY): string[] =>
  parseDateInput(text, today).map((match) => match.label);

describe("parseDateInput · els dies amb nom", () => {
  it("reads avui, demà and demà passat", () => {
    expect(dates("avui")).toEqual(["2026-08-05"]);
    expect(dates("demà")[0]).toBe("2026-08-06");
    expect(dates("demà passat")).toEqual(["2026-08-07"]);
  });

  it("ignores case and accents, so «DEMÀ» and «dema» are the same day", () => {
    expect(dates("DEMÀ")[0]).toBe("2026-08-06");
    expect(dates("dema")[0]).toBe("2026-08-06");
    expect(dates("  dema  ")[0]).toBe("2026-08-06");
  });

  it("accepts a prefix, which is the whole point of typing two letters", () => {
    expect(dates("av")).toEqual(["2026-08-05"]);
  });
});

describe("parseDateInput · els dies de la setmana", () => {
  it("takes a weekday to be the next one, short form or long", () => {
    expect(dates("dv")).toEqual(["2026-08-07"]);
    expect(dates("divendres")).toEqual(["2026-08-07"]);
    expect(dates("dl")).toEqual(["2026-08-10"]);
  });

  it("moves today's own weekday a week on, never onto today", () => {
    expect(dates("dc")).toEqual(["2026-08-12"]);
  });

  it("reads «que ve» and «vinent» as the weekday of next week", () => {
    expect(dates("dv que ve")).toEqual(["2026-08-14"]);
    expect(dates("divendres vinent")).toEqual(["2026-08-14"]);
    // On a Wednesday the two readings of Monday land on the same day, and both are right.
    expect(dates("dl que ve")).toEqual(["2026-08-10"]);
  });

  it("lists every candidate of an ambiguous prefix, soonest first and each day once", () => {
    const found = dates("di");
    expect(found).toEqual([
      "2026-08-06",
      "2026-08-07",
      "2026-08-08",
      "2026-08-09",
      "2026-08-10",
      "2026-08-11",
      "2026-08-12",
    ]);
  });

  it("never offers the same day twice, however many readings produce it", () => {
    const found = dates("d");
    expect(new Set(found).size).toBe(found.length);
  });
});

describe("parseDateInput · quantitats relatives", () => {
  it("counts days, with or without the sign and the unit", () => {
    expect(dates("3d")).toEqual(["2026-08-08"]);
    expect(dates("+3")).toEqual(["2026-08-08"]);
    expect(dates("3 dies")).toEqual(["2026-08-08"]);
    expect(dates("3")).toEqual(["2026-08-08"]);
  });

  it("counts weeks and months", () => {
    expect(dates("2s")).toEqual(["2026-08-19"]);
    expect(dates("2 setmanes")).toEqual(["2026-08-19"]);
    expect(dates("1m")).toEqual(["2026-09-05"]);
    expect(dates("2 mesos")).toEqual(["2026-10-05"]);
  });

  it("does not read «setmanes» as setembre", () => {
    expect(dates("2 setmanes")).toEqual(["2026-08-19"]);
    expect(dates("15 setmanes")).toEqual(["2026-11-18"]);
  });

  it("clamps a month that the next one is too short for", () => {
    expect(dates("1m", D("2026-01-31"))).toEqual(["2026-02-28"]);
  });

  it("refuses a figure that cannot be a plan", () => {
    expect(dates("0d")).toEqual([]);
    expect(dates("1000d")).toEqual([]);
  });
});

describe("parseDateInput · dates escrites", () => {
  it("reads day/month in the current year, whatever the separator", () => {
    expect(dates("15/9")).toEqual(["2026-09-15"]);
    expect(dates("15-9")).toEqual(["2026-09-15"]);
    expect(dates("15.9")).toEqual(["2026-09-15"]);
  });

  it("reads a month by name, abbreviated, whole, or with the «de»", () => {
    expect(dates("15 set")).toEqual(["2026-09-15"]);
    expect(dates("15 setembre")).toEqual(["2026-09-15"]);
    expect(dates("15 de setembre")).toEqual(["2026-09-15"]);
  });

  it("takes an explicit year, two digits or four, and an ISO date as it stands", () => {
    expect(dates("15/9/2027")).toEqual(["2027-09-15"]);
    expect(dates("15/9/27")).toEqual(["2027-09-15"]);
    expect(dates("2026-09-15")).toEqual(["2026-09-15"]);
  });

  it("offers a date that has already passed as written, and next year under it", () => {
    expect(dates("15/3")).toEqual(["2026-03-15", "2027-03-15"]);
    expect(dates("15 març")).toEqual(["2026-03-15", "2027-03-15"]);
  });

  it("lists both months an ambiguous name could be", () => {
    expect(dates("15 ma")).toContain("2026-03-15");
    expect(dates("15 ma")).toContain("2026-05-15");
  });

  it("refuses a day that month does not have, and a month that does not exist", () => {
    expect(dates("31/2")).toEqual([]);
    expect(dates("9/15")).toEqual([]);
  });
});

describe("parseDateInput · res que no sigui una data", () => {
  it("returns nothing rather than guessing", () => {
    expect(dates("xyz")).toEqual([]);
    expect(dates("hola que tal")).toEqual([]);
    expect(dates("://")).toEqual([]);
  });
});

describe("parseDateInput · el camp buit", () => {
  it("offers the same options as the menu, in the menu's order", () => {
    expect(labels("")).toEqual([
      "Avui",
      "Demà",
      "Divendres",
      "Dilluns que ve",
      "En 1 setmana",
      "En 1 mes",
    ]);
    expect(dates("")).toEqual([
      "2026-08-05",
      "2026-08-06",
      "2026-08-07",
      "2026-08-10",
      "2026-08-12",
      "2026-09-05",
    ]);
  });

  it("drops the option that would repeat a day already on offer", () => {
    // On a Friday, «divendres» and «+1 setmana» are the same day: offering both is offering
    // the same day twice under two names.
    expect(labels("", FRIDAY)).toEqual(["Avui", "Demà", "Divendres", "Dilluns que ve", "En 1 mes"]);
  });
});

describe("parseDateInput · what the match says it means", () => {
  it("names the reading, singular and plural", () => {
    expect(labels("1d")).toEqual(["En 1 dia"]);
    expect(labels("3d")).toEqual(["En 3 dies"]);
    expect(labels("1s")).toEqual(["En 1 setmana"]);
    expect(labels("2s")).toEqual(["En 2 setmanes"]);
    expect(labels("1m")).toEqual(["En 1 mes"]);
    expect(labels("2 mesos")).toEqual(["En 2 mesos"]);
  });

  it("names a weekday and says whether it is next week's", () => {
    expect(labels("dv")).toEqual(["Divendres"]);
    expect(labels("dv que ve")).toEqual(["Divendres que ve"]);
    expect(labels("avui")).toEqual(["Avui"]);
  });

  it("spells a written date out in full, so the year is never a surprise", () => {
    expect(labels("15/9")).toEqual(["15 de setembre de 2026"]);
    expect(labels("15/3")).toEqual(["15 de març de 2026", "15 de març de 2027"]);
  });

  it("elides «de» before a month that starts with a vowel", () => {
    expect(labels("15/8")).toEqual(["15 d'agost de 2026"]);
    expect(labels("15/10")).toEqual(["15 d'octubre de 2026"]);
  });
});
