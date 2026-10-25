import type { ReviewEvaluationCase, ReviewEvaluationOutput } from "../types";

export const evaluateFindings = (
  fixture: ReviewEvaluationCase,
  output: ReviewEvaluationOutput,
) => {
  const matched = new Set<string>();
  let evidenceMatches = 0;
  let falsePositives = 0;
  for (const finding of output.findings) {
    const source = fixture.source[finding.side];
    const evidence =
      finding.path === fixture.source.path &&
      source
        .split("\n")
        .slice(finding.start - 1, finding.end)
        .join("\n") === finding.code;
    if (evidence) evidenceMatches++;
    const expected =
      evidence &&
      fixture.expected.find(
        (issue) =>
          !matched.has(issue.id) &&
          issue.side === finding.side &&
          finding.start <= issue.line &&
          finding.end >= issue.line &&
          issue.description.test(`${finding.title} ${finding.problem}`),
      );
    if (expected) matched.add(expected.id);
    else falsePositives++;
  }
  return {
    caseId: fixture.id,
    truePositives: matched.size,
    falsePositives,
    missed: fixture.expected.length - matched.size,
    precision: output.findings.length
      ? matched.size / output.findings.length
      : null,
    recall: fixture.expected.length
      ? matched.size / fixture.expected.length
      : null,
    evidenceAccuracy: output.findings.length
      ? evidenceMatches / output.findings.length
      : null,
    durationMs: output.durationMs ?? null,
    inputTokens: output.inputTokens ?? null,
    outputTokens: output.outputTokens ?? null,
    estimatedCost: output.estimatedCost ?? null,
  };
};
