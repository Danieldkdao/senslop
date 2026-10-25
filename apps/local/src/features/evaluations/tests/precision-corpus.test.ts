import { expect, test } from "vitest";
import { precisionCorpus } from "../fixtures/precision-corpus";
import {
  runReviewEvaluation,
  compareEvaluationRuns,
} from "../lib/run-evaluation";
import { evaluateFindings } from "../lib/evaluate-findings";

test("declared corpus includes provenance, clean cases, several languages and precision scenarios", async () => {
  expect(precisionCorpus.length).toBeGreaterThanOrEqual(12);
  expect(precisionCorpus.every((fixture) => !!fixture.provenance)).toBe(true);
  const run = await runReviewEvaluation({ mode: "deterministic" });
  expect(run.mode).toBe("deterministic");
  expect(run.cases).toHaveLength(precisionCorpus.length);
  expect(
    run.cases
      .filter((fixture) => !fixture.contractPassed)
      .map((fixture) => ({
        id: fixture.caseId,
        limitations: fixture.limitations,
      })),
  ).toEqual([]);
  expect(run.totals.estimatedCost).toBeNull();
  expect(compareEvaluationRuns(run, run).regressions).toEqual([]);
});

test("a matching reference alone does not count as a correct diagnosis, and duplicates have their own metric", () => {
  const fixture = precisionCorpus.find((item) => item.exampleFinding)!;
  const finding = fixture.exampleFinding!;
  const output = evaluateFindings(fixture, {
    findings: [
      finding,
      finding,
      {
        ...finding,
        title: "Unrelated issue",
        problem: "A different unsupported claim",
      },
    ],
  });
  expect(output.truePositives).toBe(1);
  expect(output.duplicates).toBe(1);
  expect(output.falsePositives).toBe(1);
});

test("live evaluation requires an explicit inference adapter and reports regression cases", async () => {
  await expect(runReviewEvaluation({ mode: "live" })).rejects.toThrow(
    /explicit/,
  );
  const good = await runReviewEvaluation({ mode: "deterministic" });
  const empty = await runReviewEvaluation({
    mode: "live",
    model: "fixture-only",
    infer: async () => ({ findings: [] }),
  });
  expect(compareEvaluationRuns(good, empty).regressions.length).toBeGreaterThan(
    0,
  );
  expect(
    empty.cases
      .filter((item) => item.expectedIssues === 0)
      .every((item) => item.falsePositives === 0),
  ).toBe(true);
});

test("grouping reports distinguish full coverage from merging independent behaviors", async () => {
  const run = await runReviewEvaluation({
    mode: "live",
    model: "fixture",
    infer: async (fixture) => {
      const { createReviewUnits } =
        await import("@senslop/review-core/review-units");
      const { evaluationFiles } = await import("../lib/run-evaluation");
      return {
        findings: [],
        unitGroups: [
          {
            title: "Everything",
            rationale: "One group",
            unitIds: createReviewUnits(evaluationFiles(fixture)).map(
              (unit) => unit.id,
            ),
          },
        ],
      };
    },
  });
  const grouped = run.cases.find(
    (item) => item.caseId === "two-behaviors-one-file",
  )!;
  expect(grouped.groupingCoverage).toBe(1);
  expect(grouped.groupingUseful).toBe(false);
  expect(grouped.groupingIssues?.join(" ")).toMatch(/independent/);
});
