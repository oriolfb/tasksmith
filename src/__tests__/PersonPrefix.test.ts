import { extractPersonPrefix } from "../index/PersonPrefix";

describe("extractPersonPrefix", () => {
  it("returns null when there is no leading \"Word:\"", () => {
    expect(extractPersonPrefix("fer algo sense prefix", new Set(["Carmen"]))).toBeNull();
  });

  it("returns null when the leading word is not a known person", () => {
    expect(extractPersonPrefix("Idea: fer una prova", new Set(["Carmen"]))).toBeNull();
  });

  it("matches and strips the prefix when the word is a known person", () => {
    expect(extractPersonPrefix("Carmen: fer algo", new Set(["Carmen"]))).toEqual({
      name: "Carmen",
      rest: "fer algo",
    });
  });

  it("requires a space after the colon", () => {
    expect(extractPersonPrefix("Carmen:algo", new Set(["Carmen"]))).toBeNull();
  });
});
