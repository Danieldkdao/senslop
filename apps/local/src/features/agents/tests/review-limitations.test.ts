import { expect, test } from "vitest";
import { consolidateReviewLimitations } from "../lib/review-limitations";

test("repeated batch disclaimers consolidate into distinct coverage gaps", () => {
  const limitations = consolidateReviewLimitations([
    "Tests and runtime behavior were assessed from captured source only; no code was executed.",
    "Review was static and read-only. Tests were inspected but not executed; browser rendering, OAuth exchanges, credential-store operations, and native Claude execution were not verified at runtime.",
    "No code or tests were executed; verification was limited to captured source, tests, dependency context and diagnostics.",
    "The Context agent was queried twice but returned no substantive context. Relevant declarations, callers and tests were inspected through repository source tools instead.",
    "Context-agent requests returned no additional evidence. Caller and test verification relied on repository source tools.",
    "Captured diagnostics were read for every batch file with a nonzero count. Most report unavailable external declarations or aliases, preventing reliable full-project type verification.",
    "All five selected files have zero captured diagnostics.",
    "packages/ui/src/global.css: text analysis only; no compiler diagnostics.",
    "pnpm-lock.yaml: text analysis only; no compiler diagnostics.",
  ]);
  expect(limitations).toHaveLength(4);
  expect(limitations.join(" ")).toContain("Context");
  expect(limitations.join(" ")).toContain("declarations");
  expect(consolidateReviewLimitations(limitations)).toEqual(limitations);
});
test("specific errors and uncaptured evidence survive without a display cap", () => {
  const specific = [
    "Browser verification failed because the test runner crashed.",
    "a.ts: findings could not be verified against frozen source after two repairs and were excluded. Inspect this file manually.",
    "Compiler diagnostics were unavailable.",
    "Shiki implementation and declaration files were not captured, and no direct highlighter tests were found.",
    "Snapshot capture was truncated at 20 MiB.",
    "The service contract for custom-provider is unavailable.",
    ...Array.from(
      { length: 40 },
      (_, i) => `file-${i}.ts: evidence limitation ${i}`,
    ),
  ];
  expect(consolidateReviewLimitations([...specific, ...specific])).toEqual(
    specific,
  );
});
