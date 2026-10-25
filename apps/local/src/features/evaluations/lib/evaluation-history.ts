import type { LocalStore } from "@senslop/review-core/storage";
import { projectPreferenceKey } from "@senslop/review-core/policy";
import { evaluationRunSchema, type EvaluationRunSchema } from "../schemas";

export const readEvaluationHistory = (
  store: LocalStore,
  repository: string,
): EvaluationRunSchema[] => {
  const row = store.database
    .prepare("SELECT value FROM preferences WHERE name=?")
    .get(projectPreferenceKey(store, repository, "review_quality"));
  return row
    ? evaluationRunSchema.array().parse(JSON.parse(String(row.value)))
    : [];
};

export const saveEvaluationRun = (
  store: LocalStore,
  repository: string,
  run: EvaluationRunSchema,
) =>
  store.transaction(() => {
    const reports = [
      evaluationRunSchema.parse(run),
      ...readEvaluationHistory(store, repository).filter(
        (item) => item.id !== run.id,
      ),
    ].slice(0, 20);
    store.database
      .prepare(
        "INSERT INTO preferences VALUES (?,?) ON CONFLICT(name) DO UPDATE SET value=excluded.value",
      )
      .run(
        projectPreferenceKey(store, repository, "review_quality"),
        JSON.stringify(reports),
      );
    return reports;
  });
