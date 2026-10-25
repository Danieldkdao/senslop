import { WorkflowStore } from "@senslop/review-core/workflow";
import { PrecisionStore } from "@senslop/review-core/precision";
import {
  allowsSourcePath,
  readProjectPolicy,
} from "@senslop/review-core/policy";
import type { LocalStore } from "@senslop/review-core/storage";
import type { ReviewIdentitySchema, SourceSide } from "@senslop/contracts";
import { loadContext } from "./frozen-context";
import { analyzeSources } from "./snapshot-analysis";
import { readLanguageSettings } from "./language-settings";
import { changeImpact } from "./change-impact";
import type { AnalysisContext } from "./types";

export const readExplorerContext = async (
  store: LocalStore,
  repository: string,
  identity: ReviewIdentitySchema,
): Promise<AnalysisContext> => {
  const workflow = new WorkflowStore(store, repository);
  const current = workflow.requireReview(identity.id);
  if (current.hash === identity.hash && current.round === identity.round)
    return loadContext(store, repository, current);
  const review = workflow.round(identity.id, identity.round);
  if (!review || review.hash !== identity.hash)
    throw new Error("Frozen review revision unavailable.");
  const archived = store.database
    .prepare("SELECT context FROM review_rounds WHERE review_id=? AND round=?")
    .get(identity.id, identity.round);
  const context = archived?.context
    ? (JSON.parse(String(archived.context)) as AnalysisContext)
    : {
        sources: Object.fromEntries(
          review.files
            .filter((file) => file.after !== null)
            .map((file) => [file.path, file.after!]),
        ),
        before: Object.fromEntries(
          review.files
            .filter((file) => file.before !== null)
            .map((file) => [file.path, file.before!]),
        ),
        limitations: [
          "Legacy round has selected source only; supporting context was not archived.",
        ],
      };
  const policy = readProjectPolicy(store, repository);
  const sources = Object.fromEntries(
    Object.entries(context.sources).filter(([path]) =>
      allowsSourcePath(policy, path),
    ),
  );
  const before = Object.fromEntries(
    Object.entries(context.before ?? {}).filter(([path]) =>
      allowsSourcePath(policy, path),
    ),
  );
  return {
    ...context,
    sources,
    before,
    analysis: await analyzeSources(
      sources,
      review.files.map((file) => file.path),
      readLanguageSettings(store, repository),
    ),
  };
};

export const readSourceExplorer = async (
  store: LocalStore,
  repository: string,
  review: ReviewIdentitySchema,
  side: SourceSide = "after",
) => {
  const context = await readExplorerContext(store, repository, review);
  const current = new WorkflowStore(store, repository).requireReview(review.id);
  const units =
    current.hash === review.hash && current.round === review.round
      ? new PrecisionStore(store, repository).organization(review).units
      : [];
  const sources = side === "before" ? (context.before ?? {}) : context.sources;
  const analysis =
    side === "before"
      ? await analyzeSources(
          sources,
          current.files.map((file) => file.path),
          readLanguageSettings(store, repository),
        )
      : context.analysis;
  return {
    side,
    files: Object.keys(sources).sort(),
    symbols: analysis.symbols,
    capabilities: analysis.capabilities ?? {},
    impact: changeImpact(units, analysis, sources, side),
    limitations: [
      ...new Set([...context.limitations, ...analysis.limitations]),
    ],
    languageSettings: readLanguageSettings(store, repository),
  };
};
