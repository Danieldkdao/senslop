import type { FindingSchema } from "../agents/schemas";

export type ReviewEvaluationCase = {
  id: string;
  source: { path: string; before: string; after: string };
  expected: {
    id: string;
    side: "before" | "after";
    line: number;
    description: RegExp;
  }[];
  exampleFinding?: FindingSchema;
};
export type ReviewEvaluationOutput = {
  findings: FindingSchema[];
  durationMs?: number;
  inputTokens?: number;
  outputTokens?: number;
  estimatedCost?: number | null;
};
