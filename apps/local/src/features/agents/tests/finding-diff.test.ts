import { expect, test } from "vitest";
import type { PreviewFileSchema } from "@senslop/contracts";
import { findingDiff } from "../lib/finding-diff";
const file = (
  before: string | null,
  after: string | null,
): PreviewFileSchema => ({
  path: "sample.ts",
  oldPath: null,
  status: "M",
  before,
  after,
  beforeHash: null,
  afterHash: null,
  binary: false,
  added: 1,
  deleted: 1,
  diff: "",
});
const renderedLines = (
  diff: NonNullable<ReturnType<typeof findingDiff>>,
  side: "before" | "after",
) =>
  diff.hunks.flatMap((hunk) =>
    Array.from(
      { length: side === "before" ? hunk.deletionCount : hunk.additionCount },
      (_, offset) =>
        (side === "before" ? hunk.deletionStart : hunk.additionStart) + offset,
    ),
  );

test.each(["before", "after"] as const)(
  "only the selected %s lines render, including context beyond the original patch",
  (side) => {
    const before = Array.from(
      { length: 220 },
      (_, index) => `const value${index + 1} = ${index + 1};\n`,
    );
    const after = [...before];
    after[4] = "const value5 = 6;\n";
    after[209] = "const value210 = 999;\n";
    const diff = findingDiff(file(before.join(""), after.join("")), {
      side,
      start: 210,
      end: 215,
    })!;
    expect(renderedLines(diff, side)).toEqual([210, 211, 212, 213, 214, 215]);
    expect(diff.deletionLines.join("")).toBe(before.slice(209, 215).join(""));
    expect(diff.additionLines.join("")).toBe(after.slice(209, 215).join(""));
    expect(renderedLines(diff, side === "before" ? "after" : "before")).toEqual(
      [210, 211, 212, 213, 214, 215],
    );
    expect(diff.hunks.some((h) => h.additionLines && h.deletionLines)).toBe(
      true,
    );
  },
);
test("line numbers remain correct when insertions shift the opposite source", () => {
  const diff = findingDiff(
    file("one\ntwo\nthree\nfour\n", "added\none\ntwo changed\nthree\nfour\n"),
    { side: "after", start: 3, end: 4 },
  )!;
  expect(renderedLines(diff, "after")).toEqual([3, 4]);
  expect(renderedLines(diff, "before")).toEqual([2, 3]);
});
test.each([
  { before: null, after: "one\ntwo\nthree", side: "after" as const },
  { before: "one\ntwo\nthree", after: null, side: "before" as const },
])(
  "added and deleted files expose only the selected rows: $side",
  ({ before, after, side }) => {
    const diff = findingDiff(file(before, after), { side, start: 2, end: 2 })!;
    expect(renderedLines(diff, side)).toEqual([2]);
    expect(renderedLines(diff, side === "before" ? "after" : "before")).toEqual(
      [],
    );
  },
);

test("a selection spanning an insertion and context retains original gutter numbers", () => {
  const diff = findingDiff(file("one\ntwo\n", "added\none\ntwo\n"), {
    side: "after",
    start: 1,
    end: 2,
  })!;
  expect(renderedLines(diff, "after")).toEqual([1, 2]);
  expect(renderedLines(diff, "before")).toEqual([1]);
});

test("opposite-side insertions outside the selected source never shift context line numbers", () => {
  const diff = findingDiff(
    file("one\ntwo\nthree\n", "one\nadded\ntwo\nthree\n"),
    { side: "before", start: 1, end: 2 },
  )!;
  expect(renderedLines(diff, "before")).toEqual([1, 2]);
  expect(renderedLines(diff, "after")).toEqual([1, 3]);
});
