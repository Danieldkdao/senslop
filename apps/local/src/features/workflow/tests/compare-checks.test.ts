import { expect, test } from "vitest";
import { compareChecks } from "../lib/compare-checks";
import type { CheckRunSchema } from "@senslop/contracts";

test("baseline failures stay distinct from changed-source regressions and missing evidence", () => {
  const base = {
    id: "base",
    status: "failed",
    exitCode: 1,
    sourceSide: "base",
    sourceModified: false,
  } as CheckRunSchema;
  const changed = {
    id: "changed",
    baselineId: "base",
    status: "failed",
    exitCode: 1,
    sourceSide: "changed",
    sourceModified: false,
  } as CheckRunSchema;
  expect(compareChecks(changed, [base])).toBe("pre-existing-failure");
  expect(
    compareChecks(changed, [{ ...base, status: "passed", exitCode: 0 }]),
  ).toBe("regression");
  expect(
    compareChecks({ ...changed, status: "passed", exitCode: 0 }, [base]),
  ).toBe("improved");
  expect(compareChecks(changed, [{ ...base, status: "blocked" }])).toBe(
    "unavailable",
  );
});
