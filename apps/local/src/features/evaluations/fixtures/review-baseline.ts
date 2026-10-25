import type { ReviewEvaluationCase } from "../types";

export const reviewBaseline: ReviewEvaluationCase[] = [
  {
    id: "missing-null-guard",
    source: {
      path: "value.ts",
      before: "export const value = (input) => input?.value;",
      after: "export const value = (input) => input.value;",
    },
    expected: [
      {
        id: "null-input-crash",
        side: "after",
        line: 1,
        description: /null|undefined|guard/i,
      },
    ],
    exampleFinding: {
      title: "Guard nullable input",
      severity: "high",
      problem: "A null input now throws instead of returning undefined.",
      path: "value.ts",
      side: "after",
      start: 1,
      end: 1,
      code: "export const value = (input) => input.value;",
      fixPrompt: "Restore the null guard.",
    },
  },
  {
    id: "clean-null-guard",
    source: {
      path: "value.ts",
      before: "export const value = (input) => input.value;",
      after: "export const value = (input) => input?.value;",
    },
    expected: [],
  },
];
