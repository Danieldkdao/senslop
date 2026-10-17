import { expect, test } from "vitest";
import type { SavedReviewSchema } from "@senslop/contracts";
import {
  validateGrouping,
  validateReview,
  fixAllPrompt,
} from "../lib/validate-results";
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

const issue = {
  severity: "high" as const,
  title: "Missing guard",
  problem: "Null input crashes the request.",
  path: "a.ts",
  side: "after" as const,
  start: 1,
  end: 1,
  code: "new",
  fixPrompt: "Guard null input and test the empty case.",
};
test("fix prompts preserve targeted guidance in Markdown and ask the agent to validate before fixing", () => {
  const review = validateReview(
    { findings: [issue], limitations: [] },
    snapshot,
  );
  const prompt = review.findings[0]!.fixPrompt;
  expect(prompt).toContain("Path: a.ts\nLine: 1-1");
  expect(prompt).toContain("**Missing guard**");
  expect(prompt).toContain(issue.fixPrompt);
  expect(prompt).toMatch(
    /For this issue, determine whether it is valid and should be fixed. If so, fix it directly.$/,
  );
  const repeated = validateReview(review, snapshot);
  expect(repeated.findings[0]!.fixPrompt).toBe(prompt);
  const combined = fixAllPrompt(snapshot.id, repeated);
  expect(combined).toContain("### Issue 1\na.ts:1-1");
  expect(combined).toContain(issue.problem);
  expect(combined).toContain(issue.fixPrompt);
  expect(combined).not.toContain(
    "This is a comment left during a code review.",
  );
  expect(combined).toMatch(
    /For each issue above, determine whether it is valid and should be fixed. If so, fix it directly.$/,
  );
});
test("legacy saved prompts keep their actual fix guidance without nested wrappers", () => {
  const legacy = {
    ...issue,
    fixPrompt: `Fix the following verified finding from snapshot snapshot. Recheck current source before editing.\na.ts (after, lines 1–1)\n${issue.problem}\nEvidence:\n${issue.code}\n\n${issue.fixPrompt}`,
  };
  const combined = fixAllPrompt(snapshot.id, {
    findings: [legacy],
    limitations: [],
    fixAllPrompt: "Old preamble",
  });
  expect(combined).toContain(issue.fixPrompt);
  expect(combined).not.toContain("Evidence:");
  expect(combined).not.toContain("Old preamble");
});
