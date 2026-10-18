import { test, expect } from "vitest";
import { parseCommand, sourceFromOptions } from "../src/index.js";

test("arguments reject ambiguous source selections and unknown commands", () => {
  expect(parseCommand(["--help"]).command).toBe("help");
  expect(parseCommand(["inspect", "--working-tree"]).command).toBe("inspect");
  for (const args of [
    ["oops"],
    ["app", "status", "--dev"],
    ["inspect", "extra"],
    ["inspect", "--shell"],
  ])
    expect(() => parseCommand(args)).toThrow();
  for (const args of [
    {},
    { commit: "HEAD", range: "HEAD~1..HEAD" },
    { range: "HEAD...main" },
    { range: "..HEAD" },
  ])
    expect(() => sourceFromOptions(args)).toThrow();
  expect(sourceFromOptions({ range: "HEAD~1..HEAD" })).toEqual({
    kind: "range",
    base: "HEAD~1",
    head: "HEAD",
  });
});

test("inspect accepts a branch and optional base without permitting mixed inputs", () => {
  expect(
    parseCommand(["inspect", "--branch", "feature", "--base", "main"]).command,
  ).toBe("inspect");
  expect(sourceFromOptions({ branch: "feature", base: "main" })).toEqual({
    kind: "branch",
    branch: "feature",
    base: "main",
  });
  expect(sourceFromOptions({ branch: "feature" })).toEqual({
    kind: "branch",
    branch: "feature",
    base: "HEAD",
  });
  expect(() =>
    sourceFromOptions({ branch: "feature", commit: "HEAD" }),
  ).toThrow();
  expect(() =>
    sourceFromOptions({ "working-tree": true, base: "main" }),
  ).toThrow();
  expect(() => parseCommand(["preview", "--working-tree"])).toThrow(
    /Unknown command/,
  );
});
