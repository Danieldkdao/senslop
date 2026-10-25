import { checkPrecisionContracts } from "./check-precision-contracts";
import { randomUUID, createHash } from "node:crypto";
import type { PreviewFileSchema } from "@senslop/contracts";
import { createReviewUnits } from "@senslop/review-core/review-units";
import { precisionCorpus } from "../fixtures/precision-corpus";
import {
  evaluationRunSchema,
  type EvaluationMode,
  type EvaluationRunSchema,
} from "../schemas";
import type { ReviewEvaluationCase, ReviewEvaluationOutput } from "../types";
import { evaluateFindings } from "./evaluate-findings";

export const evaluationFiles = (
  fixture: ReviewEvaluationCase,
): PreviewFileSchema[] =>
  [fixture.source, ...(fixture.sources ?? [])].map((source) => ({
    ...source,
    oldPath: null,
    beforeHash: createHash("sha256").update(source.before).digest("hex"),
    afterHash: createHash("sha256").update(source.after).digest("hex"),
    status: "M",
    binary: false,
    added: 0,
    deleted: 0,
    diff: "",
  }));

export const runReviewEvaluation = async ({
  mode,
  model,
  instructions,
  infer,
  signal,
}: {
  mode: EvaluationMode;
  model?: string;
  instructions?: string;
  infer?: (fixture: ReviewEvaluationCase) => Promise<ReviewEvaluationOutput>;
  signal?: AbortSignal;
}): Promise<EvaluationRunSchema> => {
  if (mode === "live" && !infer)
    throw new Error("Live evaluations require an explicit inference adapter.");
  const started = performance.now();
  const cases: EvaluationRunSchema["cases"] = [];
  for (const fixture of precisionCorpus) {
    signal?.throwIfAborted();
    const caseStarted = performance.now();
    const units = createReviewUnits(evaluationFiles(fixture));
    let contractPassed = true;
    let contractChecks: string[] = [];
    let contractError: string | undefined;
    try {
      contractChecks = await checkPrecisionContracts(
        fixture,
        evaluationFiles(fixture),
      );
    } catch (error) {
      contractPassed = false;
      contractError = (error as Error).message;
    }
    let output: ReviewEvaluationOutput;
    const limitations: string[] = contractError ? [contractError] : [];
    try {
      output =
        mode === "live"
          ? await infer!(fixture)
          : {
              findings: fixture.exampleFinding ? [fixture.exampleFinding] : [],
              unitGroups: fixture.expectedFlowCount
                ? units.map((unit, index) => ({
                    title: `Behavior ${index + 1}`,
                    rationale: "Declared independent behavior fixture",
                    unitIds: [unit.id],
                  }))
                : [
                    {
                      title: "Changes",
                      rationale: "Fixture grouping example",
                      unitIds: units.map((unit) => unit.id),
                    },
                  ],
            };
    } catch (error) {
      if (signal?.aborted) throw error;
      output = { findings: [] };
      limitations.push(
        `Evaluation case incomplete: ${(error as Error).message}`,
      );
      contractPassed = false;
    }
    const metrics = evaluateFindings(fixture, {
      ...output,
      durationMs:
        output.durationMs ?? Math.round(performance.now() - caseStarted),
    });
    let groupingCoverage: number | null = null;
    let groupingUseful: boolean | null = null;
    const groupingIssues: string[] = [];
    if (output.unitGroups) {
      const ids = output.unitGroups.flatMap((group) => group.unitIds);
      const owned = new Set(ids);
      groupingCoverage = units.length
        ? units.filter((unit) => owned.has(unit.id)).length / units.length
        : null;
      if (
        ids.length !== owned.size ||
        ids.some((id) => !units.some((unit) => unit.id === id))
      )
        groupingIssues.push(
          "Grouping contains duplicate or unavailable region ownership.",
        );
      if (groupingCoverage !== 1)
        groupingIssues.push("Grouping omits changed regions.");
      if (
        fixture.expectedFlowCount !== undefined &&
        output.unitGroups.length !== fixture.expectedFlowCount
      )
        groupingIssues.push(
          "Declared independent behaviors were merged or split into unexpected flows.",
        );
      groupingUseful =
        fixture.expectedFlowCount === undefined && !groupingIssues.length
          ? null
          : !groupingIssues.length;
    }
    cases.push({
      ...metrics,
      scenario: fixture.scenario ?? "findings",
      provenance: fixture.provenance ?? "Historical synthetic Senslop fixture.",
      expectedIssues: fixture.expected.length,
      contractPassed,
      contractChecks,
      groupingCoverage,
      groupingUseful,
      groupingIssues,
      unitGroups: output.unitGroups,
      findings: output.findings,
      expected: fixture.expected.map(
        (issue) =>
          `${issue.id}: ${issue.path ?? fixture.source.path}:${issue.line}`,
      ),
      limitations,
    });
  }
  const sumKnown = (key: "inputTokens" | "outputTokens" | "estimatedCost") =>
    cases.every((item) => item[key] !== null)
      ? cases.reduce((sum, item) => sum + (item[key] ?? 0), 0)
      : null;
  const evidenceCases = cases.filter((item) => item.evidenceAccuracy !== null);
  return evaluationRunSchema.parse({
    id: randomUUID(),
    corpusVersion: "precision-2026-10-25-v1",
    mode,
    model: model ?? null,
    instructions,
    instructionHash: createHash("sha256")
      .update(instructions ?? "")
      .digest("hex"),
    createdAt: new Date().toISOString(),
    durationMs: Math.round(performance.now() - started),
    cases,
    totals: {
      truePositives: cases.reduce((sum, item) => sum + item.truePositives, 0),
      falsePositives: cases.reduce((sum, item) => sum + item.falsePositives, 0),
      duplicates: cases.reduce((sum, item) => sum + item.duplicates, 0),
      missed: cases.reduce((sum, item) => sum + item.missed, 0),
      evidenceAccuracy: evidenceCases.length
        ? evidenceCases.reduce((sum, item) => sum + item.evidenceAccuracy!, 0) /
          evidenceCases.length
        : null,
      inputTokens: sumKnown("inputTokens"),
      outputTokens: sumKnown("outputTokens"),
      estimatedCost: sumKnown("estimatedCost"),
    },
    limitations: [
      mode === "deterministic"
        ? "Contract checks and fixture examples only. This run does not measure live-model diagnosis quality."
        : "Expected-issue matching uses fixture locations and descriptions. Additional findings and semantic judgments require inspection; matching a source reference alone is insufficient.",
      "Requirements, rounds, rule precedence and fix-verification outcomes are deterministic contract checks. Live judgments currently cover findings and grouping; semantic grouping usefulness still needs inspection.",
      "Quality promotion thresholds are not established. Unknown usage and pricing remain unknown.",
    ],
  });
};

export { compareEvaluationRuns } from "./compare-evaluations";
