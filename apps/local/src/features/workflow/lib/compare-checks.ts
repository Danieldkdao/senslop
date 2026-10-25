import type { CheckRunSchema } from "@senslop/contracts";

export const checkComparisons = [
  "pending",
  "unavailable",
  "pre-existing-failure",
  "regression",
  "improved",
  "passed",
] as const;
export type CheckComparison = (typeof checkComparisons)[number];

export const compareChecks = (
  check: CheckRunSchema,
  checks: CheckRunSchema[],
): CheckComparison | null => {
  if (!check.baselineId) return null;
  const baseline = checks.find((run) => run.id === check.baselineId);
  if (
    [check.status, baseline?.status].some(
      (status) => status === "queued" || status === "running",
    )
  )
    return "pending";
  if (
    !baseline ||
    check.sourceModified ||
    baseline.sourceModified ||
    !["passed", "failed"].includes(check.status) ||
    !["passed", "failed"].includes(baseline.status)
  )
    return "unavailable";
  if (check.status === "passed")
    return baseline.status === "passed" ? "passed" : "improved";
  return baseline.status === "passed" ? "regression" : "pre-existing-failure";
};
