import type { EvaluationRunSchema } from "../schemas";

export const compareEvaluationRuns = (
  before: EvaluationRunSchema,
  after: EvaluationRunSchema,
) => ({
  compatibleCorpus: before.corpusVersion === after.corpusVersion,
  sameMode: before.mode === after.mode,
  sameInstructions: before.instructionHash === after.instructionHash,
  regressions: after.cases
    .filter((item) => {
      const previous = before.cases.find(
        (candidate) => candidate.caseId === item.caseId,
      );
      return (
        previous &&
        (item.missed > previous.missed ||
          item.falsePositives > previous.falsePositives ||
          item.duplicates > previous.duplicates ||
          (previous.contractPassed && !item.contractPassed) ||
          (previous.groupingUseful === true && item.groupingUseful === false) ||
          (previous.groupingCoverage !== null &&
            item.groupingCoverage !== null &&
            item.groupingCoverage < previous.groupingCoverage) ||
          (previous.evidenceAccuracy !== null &&
            item.evidenceAccuracy !== null &&
            item.evidenceAccuracy < previous.evidenceAccuracy))
      );
    })
    .map((item) => item.caseId),
});
