import { expect, test } from "vitest";
import { evaluateFindings } from "../lib/evaluate-findings";
import { reviewBaseline } from "../fixtures/review-baseline";

test("the initial review corpus measures misses, false positives, evidence, latency, and unknown cost", () => {
  const known = reviewBaseline[0]!;
  const report = evaluateFindings(known, {
    findings: [known.exampleFinding!],
    durationMs: 25,
    inputTokens: 10,
    outputTokens: 5,
    estimatedCost: null,
  });
  expect(report).toMatchObject({
    truePositives: 1,
    falsePositives: 0,
    missed: 0,
    evidenceAccuracy: 1,
    precision: 1,
    recall: 1,
    durationMs: 25,
    estimatedCost: null,
  });
  expect(evaluateFindings(known, { findings: [] })).toMatchObject({
    missed: 1,
    recall: 0,
    durationMs: null,
  });
  const clean = reviewBaseline[1]!;
  expect(
    evaluateFindings(clean, { findings: [known.exampleFinding!] }),
  ).toMatchObject({ falsePositives: 1, precision: 0, evidenceAccuracy: 0 });
  expect(evaluateFindings(clean, { findings: [] })).toMatchObject({
    falsePositives: 0,
    missed: 0,
    precision: null,
  });
});
