module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  testMatch: ["<rootDir>/src/__tests__/**/*.test.ts"],
  // Git worktrees live inside the repo, so every one of them is another `src/__mocks__/obsidian.ts`
  // in Jest's module map. It warns about the duplicates and then resolves `obsidian` to whichever
  // copy it likes, which means a mock the tests here rely on can come from another branch —
  // "Class extends value undefined" for a class that is right there in this one.
  modulePathIgnorePatterns: ["<rootDir>/.claude/worktrees/"],
  setupFiles: ["<rootDir>/jest.setup.ts"],
  moduleNameMapper: {
    obsidian: "<rootDir>/src/__mocks__/obsidian.ts",
  },
  collectCoverageFrom: [
    "src/**/*.ts",
    "!src/**/*.test.ts",
    "!src/types/**",
    "!src/__mocks__/**",
  ],
};
