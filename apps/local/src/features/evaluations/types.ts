import type { FindingSchema } from "../agents/schemas";

export type ReviewEvaluationCase = {
  provenance?: string;
  scenario?: string;
  sources?: { path: string; before: string; after: string }[];
  expectedUnitCount?: number;
  expectedFlowCount?: number;
  id: string;
  source: { path: string; before: string; after: string };
  expected: {
    id: string;
    path?: string;
    side: "before" | "after";
    line: number;
    description: RegExp;
  }[];
  exampleFinding?: FindingSchema;
};
export type ReviewEvaluationOutput = {
  unitGroups?: { title: string; rationale: string; unitIds: string[] }[];
  findings: FindingSchema[];
  durationMs?: number;
  inputTokens?: number;
  outputTokens?: number;
  estimatedCost?: number | null;
};
