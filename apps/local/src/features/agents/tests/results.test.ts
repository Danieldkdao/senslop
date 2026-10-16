import { expect, test } from "vitest";
import type { SavedReviewSchema } from "@senslop/contracts";
import { validateGrouping, validateReview } from "../lib/validate-results";
const snapshot = {
  id: "snapshot",
  files: [
    {
      path: "a.ts",
      oldPath: null,
      binary: false,
      before: "old",
      after: "new\nsecond",
      diff: "@@ -1 +1,2 @@\n-old\n+new\n+second",
    },
    { path: "b.ts", oldPath: null, binary: true, before: null, after: null },
  ],
} as unknown as SavedReviewSchema;
const groups = {
  groups: [
    {
      title: "Behavior",
      rationale: "why",
      files: [
        { path: "a.ts", summary: "changed", related: [] },
        { path: "b.ts", summary: "binary changed", related: [] },
      ],
    },
  ],
};
test("grouping requires exact coverage without duplicates or invented paths", () => {
  expect(validateGrouping(groups, snapshot).groups).toHaveLength(1);
  expect(() =>
    validateGrouping(
      {
        groups: [{ ...groups.groups[0], files: [groups.groups[0]!.files[0]] }],
      },
      snapshot,
    ),
  ).toThrow(/coverage/);
  expect(() =>
    validateGrouping(
      { groups: [...groups.groups, ...groups.groups] },
      snapshot,
    ),
  ).toThrow(/duplicate/);
});
test("review evidence must match snapshot lines and duplicate findings are collapsed", () => {
  const finding = {
    severity: "high",
    title: "Bug",
    problem: "When used, breaks",
    rationale: "why",
    path: "a.ts",
    side: "after",
    start: 1,
    end: 1,
    code: "new",
    fixPrompt: "Fix bug",
  };
  expect(
    validateReview({ findings: [finding, finding], limitations: [] }, snapshot)
      .findings,
  ).toHaveLength(1);
  expect(() =>
    validateReview(
      { findings: [{ ...finding, code: "invented" }], limitations: [] },
      snapshot,
    ),
  ).toThrow(/evidence/);
  expect(() =>
    validateReview(
      { findings: [{ ...finding, path: "other" }], limitations: [] },
      snapshot,
    ),
  ).toThrow(/snapshot/);
});
