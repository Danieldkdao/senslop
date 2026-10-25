import { expect, test } from "vitest";
import { compareStructuredData } from "../lib/structured-diff";

test("JSON comparisons preserve added, removed, changed and nested values", () => {
  const result = compareStructuredData(
    '{"name":"old","removed":true,"list":[1,2]}',
    '{"name":"new","added":null,"list":[1,3]}',
  );
  expect(result.error).toBeNull();
  expect(result.changes).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ path: "$.name", kind: "changed" }),
      expect.objectContaining({ path: "$.removed", kind: "removed" }),
      expect.objectContaining({ path: "$.added", kind: "added" }),
      expect.objectContaining({ path: "$.list[1]", kind: "changed" }),
    ]),
  );
});

test("invalid JSON stays reviewable as original text and bounded comparisons report truncation", () => {
  expect(compareStructuredData("invalid", "{}").error).toMatch(/JSON/);
  expect(compareStructuredData(null, '{"value":1}').changes[0]?.kind).toBe(
    "added",
  );
  const before = Object.fromEntries(
    Array.from({ length: 1100 }, (_, index) => [`key${index}`, 1]),
  );
  expect(compareStructuredData(JSON.stringify(before), "{}").limited).toBe(
    true,
  );
});
