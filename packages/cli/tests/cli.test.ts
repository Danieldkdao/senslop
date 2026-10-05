import { test, expect } from "vitest";
import { parseCommand, sourceFromOptions } from "../src/index.js";

test("arguments reject ambiguous source selections and unknown commands", () => {
  expect(parseCommand(["--help"]).command).toBe("help");
  expect(parseCommand(["inspect", "--working-tree"]).command).toBe("inspect");
  for (const args of [
    ["oops"],
    ["status", "--json"],
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
