import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { LocalStore } from "@senslop/review-core/storage";
import { runReviewEvaluation } from "../lib/run-evaluation";
import {
  readEvaluationHistory,
  saveEvaluationRun,
} from "../lib/evaluation-history";

test("quality reports survive reopening, remain project scoped and retain comparison inputs", async () => {
  const directory = mkdtempSync(join(tmpdir(), "senslop-quality-"));
  const store = new LocalStore(join(directory, "local.sqlite"));
  try {
    const run = await runReviewEvaluation({ mode: "deterministic" });
    saveEvaluationRun(store, directory, run);
    expect(readEvaluationHistory(store, directory)[0]).toEqual(run);
    expect(readEvaluationHistory(store, join(directory, "other"))).toEqual([]);
    store.close();
    const reopened = new LocalStore(join(directory, "local.sqlite"));
    expect(
      readEvaluationHistory(reopened, directory)[0]?.cases[0]?.findings,
    ).toEqual(run.cases[0]?.findings);
    reopened.close();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
